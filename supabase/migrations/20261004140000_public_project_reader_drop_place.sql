-- =============================================================================
-- 공개된 것을 읽는 문 — 장소를 뺀다 (16-B, 이용 정책 확인 중)
-- =============================================================================
-- **16-B.3절은 장소의 주소와 좌표를 `공개된 사실`로 보고 나가는 쪽에 두었다.**
-- 저작권으로 보면 그 판단이 맞다. 주소는 누가 지은 글이 아니다.
--
-- 그런데 **기준이 하나 더 있었다.** 그 값은 카카오 로컬 API에서 받아온
-- 것이고, 카카오맵 API 팀이 데브톡에서 여러 차례 이렇게 답했다.
--
--     "로컬API 결과값은 어떠한 형태로든 저장하여 사용할 수 없고
--      실시간 호출로만 이용할 수 있습니다"
--
--     "장소ID와 URL은 저장하여 활용 가능하며, 이 외 데이터는
--      DB저장이 불가한 점 참고하여 이용 부탁드립니다"
--
-- **한 값이 두 기준에 걸릴 수 있다는 것을 놓쳤다.** 저작권만 보고 나가는
-- 쪽에 두었다. (docs/VERIFICATION.md 4-59·4-60절)
--
-- 왜 공개만 먼저 막는가
--   **저장과 공개를 가를 수 있다.** 저장은 장소 기능의 전제이고
--   (설계 문서 17-1.4절이 그렇게 설계했다) 사용자가 정해야 하는 일이라
--   카카오의 확정 답을 기다린다.
--
--   공개는 저장보다 **한 걸음 더 나간 일**이다. 저장은 본인만 보는 것이고
--   공개는 링크를 아는 사람 누구에게나 나가는 것이다. 그리고 빼도 잃는
--   것이 거의 없다. **장소 이름(자료 제목)과 내 메모는 그대로 나간다.**
--
--   덜 나오는 쪽을 골랐다. 더 나가는 쪽은 되돌릴 수 없다.
--
-- 바뀐 것은 `place` 묶음 하나를 뺀 것뿐이다. 나머지는 그대로다.
--
-- **003을 다시 돌릴 필요는 없다.** 검사 139~143은 장소를 심지 않는다.
-- 표도 정책도 트리거도 건드리지 않는다.
--
-- 카카오가 "담아도 된다"고 답하면 그때 다시 넣는다. 그 자리의 목록은
-- `src/lib/sharing/public-fields.ts`에 있다.
-- =============================================================================

create or replace function public.public_project(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project uuid;
  v_result  jsonb;
begin
  /*
    열쇠로 프로젝트를 찾는다.

    **살아 있는 열쇠만 본다.** 끈 열쇠는 그 자리에서 죽는다. (16-B.6절)
    그리고 지운 프로젝트는 열리지 않는다. `soft_delete_project`가 열쇠를
    끄지만 **그 한 겹에만 기대지 않는다.**
  */
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select l.project_id into v_project
  from public.project_public_links l
  join public.projects p on p.id = l.project_id
  where l.token = p_token
    and l.revoked_at is null
    and p.deleted_at is null;

  if v_project is null then
    return null;
  end if;

  with recursive
  /*
    프로젝트. 이름·설명·종류만 나간다.

    `research_question`과 `target_output`은 내가 쓴 글이지만 **아직 바뀔 수
    있는 속내**라 안 나간다. (2026-10-04에 정함)
  */
  project as (
    select pg_catalog.to_jsonb(x) as value
    from (
      select p.name, p.description, p.project_type
      from public.projects p
      where p.id = v_project
    ) x
  ),

  /*
    이 프로젝트에 담긴 자료.

    **지운 자료는 나가지 않는다.** (`PUBLIC_ROW_RULES`)
  */
  source_rows as (
    select s.id, s.type, s.title, s.subtitle, s.description
    from public.sources s
    join public.source_projects sp on sp.source_id = s.id
    where sp.project_id = v_project
      and s.deleted_at is null
  ),

  /*
    자료에 붙인 메모.

    **원문과 번역문은 나가지 않는다.** 나가는 것은 `content` 하나다.
    (16-B.1절) 그리고 **기계가 쓴 기록은 줄째로 빠진다.**
  */
  capture_rows as (
    select c.source_id, c.content, c.created_at
    from public.captures c
    where c.source_id in (select id from source_rows)
      and c.deleted_at is null
      and c.ai_generated = false
      and c.content is not null
      and pg_catalog.btrim(c.content) <> ''
  ),

  sources as (
    select pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'type', s.type,
               'title', s.title,
               'subtitle', s.subtitle,
               'description', s.description,
               'captures', coalesce(
                 (select pg_catalog.jsonb_agg(
                           pg_catalog.jsonb_build_object('content', c.content)
                           order by c.created_at
                         )
                  from capture_rows c
                  where c.source_id = s.id),
                 '[]'::jsonb
               ),
               -- 논문 서지. **초록은 없다.** 밖에서 받아온 남의 글이다.
               'paper', (
                 select pg_catalog.to_jsonb(x) from (
                   select pp.authors, pp.publication_year, pp.journal_name,
                          pp.volume, pp.issue, pp.page_range, pp.doi, pp.issn,
                          pp.original_language, pp.citation_override
                   from public.paper_profiles pp where pp.source_id = s.id
                 ) x
               ),
               -- 책. 서지와 **내가 쓴 글**(why_chosen·verdict)이 함께 있다.
               'book', (
                 select pg_catalog.to_jsonb(x) from (
                   select bp.authors, bp.translators, bp.publisher,
                          bp.published_on, bp.isbn10, bp.isbn13,
                          bp.total_pages, bp.why_chosen, bp.verdict
                   from public.book_profiles bp where bp.source_id = s.id
                 ) x
               ),
               'website', (
                 select pg_catalog.to_jsonb(x) from (
                   select wp.site_name, wp.author, wp.published_at
                   from public.website_profiles wp where wp.source_id = s.id
                 ) x
               ),
               -- YouTube. **영상 번호는 없다.** 있으면 공개 페이지에서
               -- 남의 영상을 틀 수 있게 된다.
               'youtube', (
                 select pg_catalog.to_jsonb(x) from (
                   select yp.channel_name, yp.published_at, yp.duration_seconds
                   from public.youtube_profiles yp where yp.source_id = s.id
                 ) x
               ),
               'music', (
                 select pg_catalog.to_jsonb(x) from (
                   select mp.artist, mp.album_name, mp.album_artist,
                          mp.released_on, mp.track_number, mp.duration_seconds,
                          mp.genre, mp.language, mp.composer, mp.lyricist,
                          mp.arranger
                   from public.music_profiles mp where mp.source_id = s.id
                 ) x
               ),
               -- 영화·드라마. **포스터는 없다.** 남의 그림이다.
               'media', (
                 select pg_catalog.to_jsonb(x) from (
                   select dp.media_kind, dp.original_title, dp.released_on,
                          dp.genres, dp.cast_names, dp.runtime_minutes,
                          dp.season_count, dp.episode_count
                   from public.media_profiles dp where dp.source_id = s.id
                 ) x
               )
             )
             order by s.title
           ) as value
    from source_rows s
  ),

  /*
    자료에 붙지 않은 메모. **빠뜨릴 뻔한 자리다.**

    이 앱은 "자료 없이도 기록할 수 있다"고 정해 두었다. (6.2절)
    `captures.source_id`가 비어 있을 수 있고, 그런 빠른 메모는 프로젝트에
    `capture_projects`로 바로 붙는다.

    위의 `capture_rows`는 자료를 타고 모으므로 **그 메모들이 통째로
    빠진다.** 자료가 없으니 걸릴 자리가 없다. 오류도 나지 않고 공개
    페이지에서 그냥 안 보인다. **덜 나오는 것은 틀린 것처럼 보이지
    않는다.**

    자료가 있는데 그 자료가 이 프로젝트에 붙어 있지 않은 경우도 여기로
    모은다. 그쪽도 위에서 걸리지 않는다.
  */
  notes as (
    select pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('content', c.content)
             order by c.created_at
           ) as value
    from public.captures c
    join public.capture_projects cp on cp.capture_id = c.id
    where cp.project_id = v_project
      and (
        c.source_id is null
        or c.source_id not in (select id from source_rows)
      )
      and c.deleted_at is null
      and c.ai_generated = false
      and c.content is not null
      and pg_catalog.btrim(c.content) <> ''
  ),

  /*
    뼈대와 그 자리에 쓴 원고.

    **번호는 나가지 않는다.** 깊이와 순서로 모양을 전한다. `path`는 줄
    세우는 데만 쓰고 돌려주지 않는다.
  */
  tree as (
    select n.id, n.title, n.body, 0 as depth,
           array[n.position] as path
    from public.project_outline_nodes n
    where n.project_id = v_project
      and n.parent_id is null
    union all
    select c.id, c.title, c.body, t.depth + 1,
           t.path || c.position
    from public.project_outline_nodes c
    join tree t on c.parent_id = t.id
    where c.project_id = v_project
      /*
        고리가 생기면 **영영 돈다.** 로그인 없이 부를 수 있는 함수라
        그것이 곧 서비스를 멈추는 길이 된다.

        `guard_project_outline_node_move`가 고리를 막고 있지만 **그 한
        겹에만 기대지 않는다.** 이 한계는 뼈대의 깊이 한계가 아니다.
        정상적인 뼈대는 몇 단이든 50을 넘지 않고 맨 윗칸에 닿는다.
      */
      and t.depth < 50
  ),

  outline as (
    select pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'depth', t.depth,
               'title', t.title,
               'body', t.body,
               'items', coalesce(
                 (select pg_catalog.jsonb_agg(
                           pg_catalog.jsonb_build_object(
                             'note', i.note,
                             -- 무엇에 붙인 말인지. 제목은 인용 표시다.
                             'source_title', (
                               select s2.title from public.sources s2
                               where s2.id = i.source_id
                                 and s2.deleted_at is null
                             ),
                             -- 놓아둔 기록. 여기도 메모만 나간다.
                             'capture_content', (
                               select c2.content from public.captures c2
                               where c2.id = i.capture_id
                                 and c2.deleted_at is null
                                 and c2.ai_generated = false
                             )
                           )
                           order by i.position
                         )
                  from public.project_node_items i
                  where i.node_id = t.id),
                 '[]'::jsonb
               )
             )
             order by t.path
           ) as value
    from tree t
  )

  select pg_catalog.jsonb_build_object(
           'project', (select value from project),
           'sources', coalesce((select value from sources), '[]'::jsonb),
           'notes', coalesce((select value from notes), '[]'::jsonb),
           'outline', coalesce((select value from outline), '[]'::jsonb)
         )
    into v_result;

  return v_result;
end;
$$;

comment on function public.public_project(text) is
  '열쇠로 공개된 프로젝트를 읽는 문 하나. 나가는 칸만 글자로 적혀 있다. anon에게 표 권한을 주지 않으려고 함수다. (설계 문서 16-B절)';


-- -----------------------------------------------------------------------------
-- 권한
-- -----------------------------------------------------------------------------
-- **로그인하지 않아도 열린다.** (16-B.5절) 그래서 anon에게 실행 권한을
-- 준다. 이것이 anon에게 주는 **유일한 것**이고, 표 권한은 하나도 주지 않는다.
--
-- `public`에서 먼저 거둔다. 기본 권한에 기대지 않는다. (AGENTS.md 6절)

revoke all on function public.public_project(text) from public;

grant execute on function public.public_project(text) to anon, authenticated;

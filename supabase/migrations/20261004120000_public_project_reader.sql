-- =============================================================================
-- 공개된 것을 읽는 문 (16-B.8 4차례)
-- =============================================================================
-- 설계 문서 16-B절. 2차례가 **무엇이 나가는가**를 정하고, 3차례가 **열쇠**를
-- 만들었다. 이 파일은 그 열쇠로 여는 **문 하나**다.
--
-- 왜 함수인가. anon에게 표 권한을 주지 않으려고
--   16-B.5절은 "링크를 아는 사람이면 누구나, 로그인하지 않아도"라고 정했다.
--   그래서 anon이 읽어야 하는데, anon에게 표 권한을 주면 **공개된 프로젝트를
--   전부 찾아낼 수 있게 된다.** 열쇠 표를 통째로 읽거나, 공개 조건이 붙은
--   조회 정책을 돌려 목록을 긁으면 된다. 열쇠를 따로 만든 뜻이 그 자리에서
--   사라지고 주소를 맞힐 필요도 없어진다.
--
--   001의 검사 17이 "anon 역할에 테이블 권한 없음"을 0으로 지키고 있다.
--   그 보장을 깨지 않는다. **함수에 실행 권한을 주는 것은 표 권한이 아니다.**
--
--   정책으로 여는 길도 생각했다. 열쇠를 정책 안에서 견주려면 그 값이 세션에
--   있어야 하는데, PostgREST는 문장마다 트랜잭션이 따로라 `set_config`로
--   둔 값이 다음 문장까지 가지 않는다. 헤더로 넘기는 길은 서버 컴포넌트에서
--   쓰기 어렵다. **열쇠를 인자로 받는 함수가 이 일에 맞는 모양이다.**
--
-- 문이 하나인 까닭
--   표마다 함수를 두면 **빠뜨릴 자리가 표 수만큼 생긴다.** 2차례에서 목록을
--   한 곳에 둔 것과 같은 까닭이다. 문이 하나면 "무엇이 나가는가"를 한 번에
--   읽을 수 있고, 검사도 한 곳을 본다.
--
-- 칸을 글자로 적는다
--   `select *`를 쓰지 않는다. **칸을 새로 만들면 그 칸이 조용히 공개된다.**
--   `pg_catalog.to_jsonb(x)`에 넘기는 안쪽 `select`에 칸 이름을 하나씩 적는다. 길지만
--   그것이 이 파일의 일이다.
--
--   `tests/sharing-public-reader.test.mjs`가 `public-fields.ts`의 목록과
--   이 글을 견준다. 나가야 하는 칸이 여기 없으면 실패하고, **못 박은 칸이
--   여기 있으면 실패한다.**
--
-- 어느 줄이 나가는가
--   칸 고르기로 안 되는 것이 둘 있다. (`PUBLIC_ROW_RULES`)
--
--     - **기계가 쓴 기록.** 칸을 빼도 그 글은 나가고, 다른 메모들과 나란히
--       놓이면 **내 생각이라는 얼굴로** 나간다.
--     - **지운 것.** 삭제는 표시만 하므로 칸을 빼는 것은 아무것도 막지 않는다.
--
--   둘 다 `where`에 걸린다.
--
-- 모르면 아무것도 돌려주지 않는다
--   틀린 열쇠, 끈 열쇠, 지운 프로젝트는 **전부 `null`이다.** 어느 경우인지
--   구분해 알리지 않는다. "없는 자료와 남의 자료를 구분하지 않는다"와 같은
--   생각이다. (보안 원칙 9)
--
-- 번호는 나가지 않는다
--   뼈대는 `depth`와 순서로 나간다. **나가는 것은 세워진 모양이지 번호가
--   아니다.** 그래서 `parent_id`도 `id`도 돌려주지 않는다.
--
-- 재실행 안전성
--   `create or replace` 하나다.
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
               'captures', pg_catalog.coalesce(
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
               -- 장소. 주소와 좌표는 공개된 사실이다. **전화번호는 없다.**
               'place', (
                 select pg_catalog.to_jsonb(x) from (
                   select plp.road_address, plp.address, plp.latitude,
                          plp.longitude, plp.category, plp.postal_code,
                          plp.region
                   from public.place_profiles plp where plp.source_id = s.id
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
               'items', pg_catalog.coalesce(
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
           'sources', pg_catalog.coalesce((select value from sources), '[]'::jsonb),
           'notes', pg_catalog.coalesce((select value from notes), '[]'::jsonb),
           'outline', pg_catalog.coalesce((select value from outline), '[]'::jsonb)
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

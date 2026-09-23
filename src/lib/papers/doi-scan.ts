/**
 * 글 더미에서 DOI를 찾아낸다. (설계 문서 8.5절)
 *
 * 논문 첫 장에는 DOI가 거의 항상 인쇄되어 있다. 그 값의 생김새는 정해져 있어서
 * 기계적으로 찾을 수 있다. **추측이 아니다.**
 *
 * 저자나 학술지명을 글에서 읽어내려 하지 않는 이유가 여기 있다. 첫 장의
 * 생김새는 학술지마다 다르다. 저자가 제목 위에 있기도 아래에 있기도 하고,
 * 소속·이메일·각주가 섞이고, 2단 편집이면 줄이 엉킨다. 어디부터 어디까지가
 * 저자인지는 추측할 수밖에 없고, 잘못 뽑은 서지 정보는 알아채기 어렵다.
 *
 * DOI는 다르다. 찾거나 못 찾거나 둘 중 하나다. 찾으면 Crossref가 출판사가
 * 등록한 값을 그대로 돌려준다. 그 길에는 추측이 한 군데도 없다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

/**
 * DOI의 생김새.
 *
 * `10.` 다음에 등록기관 번호 4~9자리, `/`, 그리고 출판사가 정한 글자들이다.
 * 뒤쪽에 올 수 있는 글자는 사실상 제한이 없어서, 흔히 쓰이는 범위만 받는다.
 *
 * 대소문자를 가리지 않는다. DOI는 대소문자를 구분하지 않는 값이다.
 */
const DOI_PATTERN = /10\.\d{4,9}\/[-._;()/:a-z0-9<>]+/gi;

/**
 * DOI 끝에 붙어 오는 문장 부호.
 *
 * 글 안에서는 `…9028-2.` 처럼 마침표가 붙고, 괄호 안에 들어 있기도 하다.
 * 그대로 두면 없는 DOI가 된다.
 *
 * 다만 `.`과 `)`는 DOI 자체에도 쓰인다. 그래서 **끝에 붙은 것만** 떼고,
 * 괄호는 짝이 맞지 않을 때만 떼어낸다.
 */
function trimTrailingPunctuation(value: string): string {
  let text = value;

  for (;;) {
    const last = text[text.length - 1];

    if (last === undefined) {
      return text;
    }

    if (".,;:'\"".includes(last)) {
      text = text.slice(0, -1);
      continue;
    }

    // 닫는 괄호는 여는 괄호가 모자랄 때만 뗀다. DOI 안에 괄호 쌍이 오기도 한다.
    if (last === ")" || last === "]" || last === ">") {
      const open = last === ")" ? "(" : last === "]" ? "[" : "<";
      const opens = text.split(open).length - 1;
      const closes = text.split(last).length - 1;

      if (closes > opens) {
        text = text.slice(0, -1);
        continue;
      }
    }

    return text;
  }
}

/**
 * PDF에서 꺼낸 글을 DOI를 찾을 수 있는 모양으로 다듬는다.
 *
 * PDF는 줄바꿈을 마음대로 넣는다. 긴 DOI가 두 줄에 걸치면 가운데가 끊긴다.
 * 줄바꿈 앞뒤에 공백이 없을 때만 이어 붙인다. 공백이 있으면 원래 떨어진 말이다.
 *
 * 붙임표로 끝나고 줄이 바뀐 경우도 이어 붙인다. 다만 붙임표는 지운다.
 * 조판이 넣은 것일 수도 DOI의 일부일 수도 있는데, DOI 쪽이 훨씬 잦다.
 */
export function joinBrokenLines(text: string): string {
  return text
    // `10.1007/` 다음에 줄이 바뀐 경우처럼, 공백 없이 끊긴 곳을 잇는다.
    .replace(/([^\s-])[\r\n]+([^\s])/g, "$1$2")
    .replace(/-[\r\n]+/g, "-");
}

/**
 * 붙임표나 빗금 뒤에 생긴 빈틈을 메운다.
 *
 * PDF에서 글자를 꺼내면 줄이 끊긴 자리가 줄바꿈이 아니라 **공백**으로 온다.
 * 조판이 어디서 줄을 바꿨는지를 PDF가 기억하지 않기 때문이다.
 *
 *   파일 안:  doi:10.1007/s10649-
 *             006-9028-2
 *   꺼낸 글:  doi:10.1007/s10649- 006-9028-2
 *
 * 이것을 메우지 않으면 `10.1007/s10649-`에서 끊긴 DOI를 얻는다.
 * **그 값은 그럴듯해 보이는데 어느 논문도 가리키지 않는다.** 틀렸다는 것을
 * 알아채기 어려운 쪽이라 반드시 메워야 한다.
 *
 * 2026-09-23에 실제로 PDF에서 글자를 꺼내 보고 발견했다.
 *
 * 붙임표 뒤의 공백을 없애면 보통 글도 함께 붙는다. `pre- and`가 `pre-and`가
 * 된다. 그래도 괜찮은 이유는, 그렇게 붙은 말이 DOI 생김새와 맞아떨어지려면
 * 앞에 `10.` 네 자리와 빗금이 있어야 하기 때문이다. 보통 글에는 그런 것이 없다.
 */
export function mendBrokenTokens(text: string): string {
  return text
    .replace(/([-/])[ \t]*[\r\n]+[ \t]*/g, "$1")
    .replace(/([-/])[ \t]+(?=[A-Za-z0-9])/g, "$1");
}

/**
 * 글에서 DOI를 모두 찾는다. 나온 순서를 지키고 같은 것은 한 번만 담는다.
 *
 * 여럿이 나올 수 있다. 논문 자신의 DOI 말고도 참고문헌이나 학술지 자체의
 * DOI가 같은 쪽에 있을 수 있다. 하나를 고르는 일은 여기서 하지 않는다.
 * 보통 첫 번째가 그 논문의 것이지만 **보통**이 늘 맞지는 않아서,
 * 여럿이면 사용자가 고르게 한다.
 */
export function findDois(text: string): string[] {
  /*
    두 가지 모양에서 각각 찾는다.

    빈틈을 메운 글에서만 찾으면, 원래 멀쩡했던 DOI가 메우는 과정에서 뒷말과
    붙어버릴 수 있다. 메우지 않은 글에서만 찾으면 줄이 끊긴 DOI를 놓친다.
    둘 다 보고, 아래에서 짧게 잘린 쪽을 걸러낸다.
  */
  const found: string[] = [];
  const seen = new Set<string>();

  for (const variant of [joinBrokenLines(text), mendBrokenTokens(text)]) {
    for (const match of variant.matchAll(DOI_PATTERN)) {
      const doi = trimTrailingPunctuation(match[0]).toLowerCase();

      // 잘라내고 나서 알맹이가 남지 않으면 버린다.
      if (!/^10\.\d{4,9}\/.+$/.test(doi)) {
        continue;
      }

      if (seen.has(doi)) {
        continue;
      }

      seen.add(doi);
      found.push(doi);
    }
  }

  /*
    앞부분이 같고 더 긴 것이 있으면 짧은 쪽은 잘린 것이다.

    줄이 끊긴 DOI에서 두 모양이 각각 `10.1007/s10649-`와
    `10.1007/s10649-006-9028-2`를 내놓는다. 둘 다 남기면 사용자에게
    고르라고 물어야 하는데, 한쪽은 아무것도 가리키지 않는 값이다.
    물을 일이 아니라 버릴 일이다.
  */
  return found.filter(
    (doi) => !found.some((other) => other !== doi && other.startsWith(doi)),
  );
}

function visibleText(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Detect only explicit visible access/login walls; ordinary reCAPTCHA scripts are ignored. */
export function isAccessRestricted(html, finalUrl) {
  const text = visibleText(html);
  if (/(?:access denied|request blocked|bot verification|human verification|just a moment|アクセスが拒否|アクセスが制限|閲覧制限|人間であることを確認)/iu.test(text)) {
    return true;
  }
  if (/(?:ログインしてください|ログインが必要|sign in to continue|login required)/iu.test(text)) return true;
  if (/<input\b[^>]*\btype=["']password["']/iu.test(html) && /(?:login|sign[ -]?in|ログイン|会員)/iu.test(text)) return true;
  try {
    const pathname = new URL(finalUrl).pathname;
    if (/\/(?:login|signin|sign-in|auth)(?:[/?#]|$)/iu.test(pathname)) return true;
  } catch {
    // finalUrl is normally absolute; leave malformed redirects to the normal parser.
  }
  return /(?:i am not a robot|私はロボットではありません|captcha を入力|captchaを入力)/iu.test(text);
}

import assert from "node:assert/strict";
import { isAccessRestricted } from "./frontier-access-policy.mjs";

assert.equal(isAccessRestricted("<html><body>Access denied</body></html>", "https://example.com/event"), true);
assert.equal(isAccessRestricted("<html><body>ログインが必要です</body></html>", "https://example.com/event"), true);
assert.equal(isAccessRestricted("<html><body>普通の演出页面<script src=\"https://www.google.com/recaptcha/api.js\"></script></body></html>", "https://example.com/event"), false);
assert.equal(isAccessRestricted("<html><body>Sign in</body></html>", "https://example.com/login"), true);
assert.equal(isAccessRestricted("<html><body><input type=\"password\"> Login</body></html>", "https://example.com/event"), true);

console.log("Frontier access policy fixture 测试通过：CAPTCHA/login/access restriction 仅在显式墙页归类为 blocked。");

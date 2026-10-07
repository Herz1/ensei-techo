/** Keep the original bytes until every section has been written. */
export function restoreBackupAtomically(storage, keys, apply, notify = () => {}) {
  const originals = new Map(keys.map((key) => [key, storage.getItem(key)]));
  try {
    apply();
  } catch (error) {
    let rollbackFailed = false;
    for (const [key, value] of originals) {
      try {
        if (storage.getItem(key) === value) continue;
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch { rollbackFailed = true; }
    }
    notify();
    if (rollbackFailed) throw new Error("恢复未完成，浏览器也阻止回滚；请释放存储空间后用原备份重试");
    throw new Error(`恢复失败，已保留导入前记录：${error.message}`);
  }
}

// Báo tiến trình theo thời gian thực: agent nào đang chạy. Mỗi request có một "người nghe" riêng (AsyncLocalStorage).
import { AsyncLocalStorage } from 'node:async_hooks';

export const progress = new AsyncLocalStorage();

/** Báo một agent bắt đầu làm việc. Không có người nghe (npm test, gọi nội bộ) thì bỏ qua. */
export function emit(agent, detail = '') {
  const fn = progress.getStore();
  if (fn) fn(agent, detail);
}

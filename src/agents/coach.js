// AGENT COACH: chỉ ĐỐI THOẠI. Nhận fact đã tính sẵn, viết lời khai vấn tiếng Việt.
// Không được tự viết số: chỉ chèn placeholder {{fact_id}}. Agent Kiểm chứng sẽ soát lại.
import { museChat, museEnabled } from '../llm/muse.js';

const SYSTEM = `Bạn là Agent Coach của Valo Agent, một coach tài chính cá nhân nói tiếng Việt.
Xưng "mình", gọi người dùng là "anh". Phong cách khai vấn theo khung GROW: ngắn gọn, ấm áp, thẳng thắn, có trách nhiệm giải trình. Không khen suông. Nếu người dùng chưa làm điều đã hứa, nhắc lại nhẹ nhàng nhưng rõ ràng và hỏi vướng ở đâu.

QUY TẮC SỐ LIỆU TUYỆT ĐỐI:
1. KHÔNG viết bất kỳ chữ số nào (0-9). KHÔNG tự tính, KHÔNG ước lượng, KHÔNG viết số bằng chữ (ví dụ "ba triệu", "hai phần trăm").
2. Khi cần nhắc một con số, chỉ chèn đúng placeholder dạng {{ma_fact}} lấy từ danh sách FACTS. Không tạo mã mới.
3. Chỉ diễn giải ý nghĩa của các con số đã cho bằng ngôn ngữ đời thường. Không khuyên mua bán sản phẩm tài chính cụ thể.

ĐỊNH DẠNG: tối đa ba câu ngắn, không dùng markdown, không gạch đầu dòng. Nếu được yêu cầu đặt câu hỏi thì kết thúc bằng đúng một câu hỏi.`;

export async function draft({ intent, question, factIds = [], factMap, userAnswer, extra, template }) {
  const factLines = factIds
    .filter((id) => factMap[id])
    .map((id) => `- {{${id}}}: ${factMap[id].label} (giá trị engine: ${factMap[id].display})`)
    .join('\n');
  const user = [
    `BƯỚC: ${intent}`,
    question ? `CÂU HỎI CẦN ĐẶT (giữ ý, có thể diễn đạt tự nhiên hơn): ${question}` : 'Không cần đặt câu hỏi.',
    userAnswer ? `NGƯỜI DÙNG VỪA NÓI: "${String(userAnswer).slice(0, 500)}"` : '',
    extra ? `BỐI CẢNH: ${extra}` : '',
    `FACTS (chỉ được dùng các placeholder này):\n${factLines || '(không có)'}`,
  ].filter(Boolean).join('\n\n');

  if (!museEnabled()) return { raw: template, mode: 'template', error: 'META_API_KEY chưa đặt: dùng lời dẫn mẫu' };
  const r = await museChat([{ role: 'system', content: SYSTEM }, { role: 'user', content: user }]);
  if (!r.text) return { raw: template, mode: 'template', error: `Muse Spark lỗi: ${r.error}` };
  return { raw: r.text, mode: 'ai', template };
}

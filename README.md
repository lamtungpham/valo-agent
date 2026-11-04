Ý tưởng lấy cảm hứng từ app quản lý tài chính cá nhân làm trước đó (Valo); toàn bộ code trợ lý trong repo này được viết mới trong tuần thi 27/10–05/11/2026.

# Valo Agent (Beta)

AI Agent đóng vai **coach tài chính cá nhân bằng tiếng Việt**. Không phải chatbot hỏi gì đáp nấy: agent có hồ sơ coaching bền vững, đi theo khung **GROW**, chốt **cam kết có hạn**, theo dõi và **hỏi lại cam kết chưa làm**, tự lên tiếng khi dữ liệu **lệch ngưỡng**. Mọi con số do **engine xác định** tính; LLM (Muse Spark) chỉ kể chuyện.

> Demo chỉ dùng dữ liệu **hư cấu** của nhân vật "Mr. Sample". Không có dữ liệu thật, key hay token nào trong repo.

## Phần có sẵn trước và phần làm mới

| | Nội dung |
|---|---|
| **Có sẵn trước tuần thi** | Ý tưởng sản phẩm và app quản lý tài chính Valo (repo khác); định dạng xuất dữ liệu `valo-financial-context` v4.0 mà adapter đọc vào; file logo Valo trong `public/brand/` và bảng màu, font của Valo Web App (giao diện Valo Agent viết CSS mới theo cùng bộ màu). |
| **Làm mới trong tuần thi** (toàn bộ repo này) | Engine tài chính và BHXH, multi-agent, vòng coaching GROW + OSKAR + WOOP + MI và cam kết, đánh giá theo sự kiện, tool mô phỏng, adapter Valo và mock, nhánh hỏi coaching, giao diện, test. Không chép code từ app cũ. |

## Chạy bằng một lệnh

Cần Node.js 18 trở lên. Không cần `npm install` (không có thư viện ngoài).

```bash
npm start
```

Mở http://localhost:3000. Chạy test: `npm test`.

Muốn bật AI, sao chép `.env.example` thành `.env` và điền `META_API_KEY`. Không có key thì app vẫn chạy đầy đủ: số vẫn do engine tính, lời coach dùng lời dẫn mẫu và được ghi nhãn "Lời dẫn mẫu (chưa gọi được AI)".

| Biến | Ý nghĩa |
|---|---|
| `META_API_KEY` | Key Meta Model API cho Muse Spark |
| `META_API_BASE_URL` | Mặc định `https://api.meta.ai/v1` |
| `META_MODEL` | Mặc định `muse-spark-1.3` |
| `VALO_API_BASE_URL`, `VALO_API_TOKEN` | Adapter Valo thật qua HTTP |
| `VALO_CONTEXT_FILE` | Hoặc đọc file JSON xuất từ Valo |
| `PORT` | Cổng web, mặc định 3000 |

## Kiến trúc

```
                 ┌──────────── Agent chính (điều phối) ─────────────┐
                 │  chỉ nhận tóm tắt, quyết định bước kế tiếp        │
                 └──────────────────────────────────────────────────┘
 Adapter Valo ─▶ Agent Thu thập ─▶ Agent Phân tích ─▶ Agent Coach ─▶ Agent Kiểm chứng ─▶ Người dùng
 (API | mock)    chỉ đọc, đóng     chỉ chạy engine,     chỉ đối thoại,  soát số, gắn nguồn,
                 băng snapshot     phát sự kiện ngưỡng  Muse Spark      ngày dữ liệu, công thức
```

| Thư mục | Vai trò |
|---|---|
| `src/engine/` | Engine xác định: `finance.js` (quỹ dự phòng, tỷ trọng tài sản, chi tiêu, mục tiêu, what-if, A/B, sốc mất việc), `bhxh.js` (lịch sử theo năm/tháng, tháng ngắt quãng, tuổi luật, tỷ lệ hưởng, lương hưu, trạng thái theo tuổi), `facts.js` (mỗi số mang nhãn, công thức, nguồn, ngày dữ liệu) |
| `src/agents/collector.js` | Agent Thu thập: chỉ đọc qua adapter |
| `src/agents/analyst.js` | Agent Phân tích: chạy engine, trả sự kiện có cấu trúc khi lệch ngưỡng |
| `src/agents/coach.js` | Agent Coach: gọi Muse Spark, chỉ được chèn mã `{{fact_id}}`, không được viết số |
| `src/agents/verifier.js` | Agent Kiểm chứng: chặn mọi chữ số hoặc số viết bằng chữ ngoài fact, mã fact bịa; khi chặn thì dùng lời dẫn mẫu |
| `src/agents/orchestrator.js` | Agent chính: vòng GROW, trách nhiệm giải trình, đánh giá theo sự kiện, tóm tắt định kỳ |
| `src/agents/tools.js` | Tool hành động: tạo mục tiêu, đặt nhắc, what-if, so sánh A/B, mô phỏng sốc |
| `src/agents/onboarding.js` | Nhánh chưa dùng Valo: 13 câu khai vấn, bản đồ tài chính, hồ sơ tạm |
| `src/adapters/` | `valoAdapter.js` (interface), `mockAdapter.js` (dữ liệu hư cấu), `httpAdapter.js` + `valoContextMapper.js` (Valo thật), `index.js` (chọn adapter, fallback mock có nhãn) |
| `src/llm/muse.js` | Client Muse Spark (OpenAI-compatible `/chat/completions`), key từ biến môi trường |
| `src/store.js` | Hồ sơ coaching bền vững trong `data/store.json` (đã gitignore): mục tiêu, cam kết, lịch sử vi phạm, phiên GROW đang dở, dữ liệu Valo đã dán. Một người dùng; bản nhiều người dùng sẽ dùng chung đăng nhập Supabase của Valo với bảng hồ sơ coaching có RLS |
| `fixtures/` | Dữ liệu hư cấu Mr. Sample: bộ 1 liên tục, bộ 2 thiếu 03-05/2022, bản định dạng Valo để test adapter |
| `public/` | Giao diện web thuần HTML/CSS/JS |

### Vì sao LLM không thể bịa số

1. Agent Coach nhận danh sách fact kèm mã, được yêu cầu chỉ chèn `{{ma_fact}}`.
2. Agent Kiểm chứng bỏ placeholder ra rồi quét văn bản: còn chữ số, còn từ chỉ số như "triệu", "tỷ", "phần trăm", hoặc có mã fact không tồn tại thì **chặn cả bản nháp** và thay bằng lời dẫn mẫu.
3. Giao diện thay mã bằng giá trị engine, hiện dạng chip xanh. Rê chuột vào chip để xem công thức, nguồn, ngày dữ liệu. Mỗi tin có nhãn "Nhận định của AI · Muse Spark" hoặc "Lời dẫn mẫu", tách bạch với bảng "Số tính được bởi engine".

## Khung khai vấn

GROW là khung mặc định, có thêm ba lớp, mỗi tin coach chỉ hỏi một câu:

| Lớp | Dùng khi | Bước trong app |
|---|---|---|
| **Stages of Change + MI** | Mở phiên, hỏi mức sẵn sàng. Người còn lưỡng lự không bị ép đặt mục tiêu | Khơi khoảng cách (dùng số mô phỏng sốc của engine), phản chiếu hai phía, thước đo tầm quan trọng 0-10, xin phép thử bước nhỏ hoặc hẹn hỏi lại sau 7 ngày |
| **GROW + OSKAR** | Phiên mục tiêu | Goal/Outcome → Reality + Scaling 0-10 → Know-how (từng làm được nhờ đâu) → Options (engine tính) → Will + Affirm |
| **WOOP** | Hành vi nhỏ tuần này, chống tái phát | Wish (mức đã chọn) → Outcome → Obstacle nội tại → Plan "Nếu… thì tôi sẽ…" → thước đo tự tin (dưới 7 thì tự hạ mức) |
| **OSKAR Review** | Đầu phiên sau | Đã làm: hỏi điều gì giúp làm được, chấm lại điểm. Chưa làm: đối chiếu trở ngại và kế hoạch nếu-thì đã lường trước, hỏi chuyện gì thực sự xảy ra, chọn mức chắc tay hơn |

Câu trả lời của người dùng (điểm 0-10, trở ngại, kế hoạch nếu-thì) cũng là fact có nguồn "Phiên coaching", nên Agent Kiểm chứng vẫn chặn mọi con số LLM tự viết.

## Vòng lặp P0 đầu cuối

1. Mở app: Agent Phân tích thấy quỹ dự phòng **1,6 tháng < 3 tháng** và tự lên tiếng (cùng cảnh báo chi tiêu vượt ngân sách, tuổi nghỉ dự định sớm hơn tuổi luật).
2. Bấm "Bắt đầu phiên coaching", chọn "Muốn bắt đầu, cần một kế hoạch". Coach hỏi theo GROW: **Goal** (quỹ bao nhiêu tháng), **Reality** (số engine + tự chấm 0-10), Know-how, **Options** (ba mức để riêng mỗi tuần, engine tính số tháng về đích), rồi WOOP.
3. **Will**: coach đề xuất kế hoạch và cam kết có hạn, ví dụ "Để riêng 500.000 đ vào quỹ dự phòng trước 11/11/2026". Bấm "Tôi cam kết" để ghi.
4. Tab Dữ liệu → "Tua 7 ngày": agent nhắc cam kết tới hạn và gửi tóm tắt tuần. "Tua 1 ngày" nữa: cam kết quá hạn, bấm "Bắt đầu / tiếp tục phiên", coach **nhắc lại cam kết cũ và hỏi chuyện gì đã xảy ra so với trở ngại và kế hoạch nếu-thì đã lường trước**, ghi vào lịch sử vi phạm rồi mở vòng mới với mức chắc tay hơn.
5. Tab BHXH: lưới đóng theo năm và tháng, số tháng ngắt quãng, tuổi luật so với tuổi dự định, lương hưu dự kiến, **thanh trượt 31-85 tuổi**. Tab Dữ liệu → chọn "Bộ 2" để thấy engine báo đúng **3 tháng ngắt quãng 03, 04, 05/2022**.

Chọn "Biết là cần nhưng còn lưỡng lự" ở câu đầu để xem nhánh MI.

Phiên đang dở được lưu: tải lại trang hoặc khởi động lại server, coach tiếp tục đúng bước cũ.

## Kết quả engine với Mr. Sample (hư cấu)

Giả định: nam, sinh 05/1995 (31 tuổi), đóng BHXH 01/2018-10/2026, lương 10 triệu (2018-2020), 15 triệu (2021-2023), 20 triệu (2024-2026), dự phóng 20 triệu tới 58 tuổi.

| Chỉ số | Bộ 1 | Bộ 2 |
|---|---|---|
| Tháng đã đóng | 106 | 103 |
| Tháng ngắt quãng | 0 | 3 (03/2022, 04/2022, 05/2022) |
| Tổng tháng tới 58 tuổi | 424 (35 năm 4 tháng, tính tỷ lệ 35,5 năm) | 421 |
| Bình quân tiền lương | 18.726.415 đ | 18.752.969 đ |
| Tỷ lệ hưởng | 75% | 75% |
| Lương hưu dự kiến | 14.044.811 đ/tháng | 14.064.727 đ/tháng |
| Tuổi luật | 62 tuổi, đủ tuổi 05/2057 | như bên |
| Chờ từ 58 tới 62 | 48 tháng, cần tự lo 576.000.000 đ (12 triệu/tháng, giá hôm nay) | như bên |

Căn cứ đơn giản hoá: Bộ luật Lao động 2019 Điều 169 và Nghị định 135/2020 (tuổi nghỉ hưu điều kiện bình thường), Luật BHXH 2024 (tối thiểu 15 năm; nam 45% cho 20 năm, +2%/năm, tối đa 75%; trợ cấp một lần cho số năm vượt mốc 75%). Giả định hệ số trượt giá bằng 1 và lương hưu giữ nguyên danh nghĩa. Đây là công cụ lập kế hoạch, không phải xác nhận của cơ quan BHXH.

## Adapter Valo (P1)

Dữ liệu trong Valo được mã hoá đầu-cuối (chỉ trình duyệt có passphrase mới giải mã), nên Valo Agent không kéo thẳng từ server Valo. Có ba đường vào, đều đi qua cùng một mapper `valo-financial-context` v4.0:

- **Dán dữ liệu (khuyên dùng):** trong Valo mở Cố vấn AI → "Chỉ sao chép dữ liệu", rồi dán (hoặc chọn file JSON) ở tab Dữ liệu → "Nối dữ liệu từ Valo". Dữ liệu chỉ lưu trong `data/store.json` trên máy chạy Valo Agent.
- **API:** `VALO_API_BASE_URL` cho một endpoint trả cùng định dạng (khi Valo có nơi phát dữ liệu đã giải mã có sự đồng ý của người dùng).
- **File:** `VALO_CONTEXT_FILE`.

`ValoDataAdapter.getSnapshot()` trả một snapshot chuẩn hoá (mô tả trong `src/adapters/valoAdapter.js`). Các bản cài đặt:

- `MockValoAdapter`: đọc `fixtures/mr-sample*.json`, luôn gắn nhãn "DỮ LIỆU HƯ CẤU".
- `ImportedValoAdapter` (trong `index.js`): đọc dữ liệu người dùng đã dán.
- `HttpValoAdapter`: `GET {VALO_API_BASE_URL}/financial-context` (Bearer `VALO_API_TOKEN` nếu có) hoặc đọc `VALO_CONTEXT_FILE`, nhận định dạng `valo-financial-context` v4.0 mà app Valo đang xuất, rồi ánh xạ sang snapshot.

Chọn "Valo API thật" ở tab Dữ liệu. Nếu chưa cấu hình hoặc API lỗi, app tự dùng mock và hiện rõ lý do trên giao diện.

## Nhánh chưa dùng Valo (P2)

Tab "Chưa dùng Valo": 13 câu khai vấn, mỗi tin một câu, bắt đầu từ điều khiến người dùng chưa yên tâm nhất rồi mới tới thu nhập, chi tiêu, nợ, quỹ dự phòng, mục tiêu, khẩu vị rủi ro. Kết thúc bằng bản đồ tài chính trực quan (dòng tiền, tài sản và nợ, quỹ khẩn cấp, mục tiêu so với khả năng), hồ sơ tạm, và lời mời nối Valo.

## Test

`npm test` chạy 16 test: lịch sử BHXH hai bộ dữ liệu, tuổi luật, tỷ lệ hưởng, dự phóng lương hưu, thanh trượt, quỹ dự phòng và mô phỏng, Agent Kiểm chứng chặn số bịa, adapter Valo qua HTTP, dữ liệu dán và fallback.

## Lưu ý

Valo Agent là công cụ giáo dục và lập kế hoạch, không phải lời khuyên đầu tư. Không khuyến nghị mua bán sản phẩm tài chính cụ thể.

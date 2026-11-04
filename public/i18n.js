// Giao diện tiếng Anh: dịch phần chữ của giao diện ngay trên DOM (không đụng số liệu engine).
// Số tiền, số tháng, tuổi được đổi định dạng; lời coach do Muse Spark viết thẳng bằng tiếng Anh.
const KEY = 'valo-agent.lang';
let lang = 'vi';
try { lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'vi'; } catch {}

export const getLang = () => lang;

// Câu trọn vẹn (khớp nguyên văn sau khi bỏ khoảng trắng hai đầu)
const EXACT = {
  'Coach tài chính cá nhân · số liệu do engine tính': 'Personal finance coach · numbers computed by the engine',
  'Bản thử nghiệm: tính năng và số liệu có thể thay đổi': 'Preview build: features and numbers may change',
  'DỮ LIỆU HƯ CẤU': 'FICTIONAL DATA',
  'Hôm nay (mô phỏng):': 'Today (simulated):',
  'Đổi chế độ hiển thị': 'Change display mode',
  'Valo Agent đang ở bản Beta.': 'Valo Agent is in Beta.',
  'Đây là công cụ giáo dục và lập kế hoạch, không phải lời khuyên đầu tư. Số liệu do engine tính kèm nguồn và công thức; lời coach do AI viết có thể chưa hoàn hảo.': 'This is an education and planning tool, not investment advice. Numbers are computed by the engine with sources and formulas; coach wording is written by AI and may not be perfect.',
  'Phiên coaching': 'Coaching session',
  'Bắt đầu / tiếp tục phiên': 'Start / resume session',
  'Các agent đang làm việc…': 'The agents are working…',
  'Trả lời coach bằng lời của bạn…': 'Reply to the coach in your own words…',
  'Trả lời bằng lời của bạn': 'Answer in your own words',
  'Ví dụ: 15 triệu, 500k, 20.000.000': 'e.g. 15 triệu, 500k, 20,000,000 (VND)',
  'Nhập một con số': 'Enter a number',
  'Chọn một ý hoặc tự gõ': 'Pick an option or type your own',
  'Gửi': 'Send',
  'Tổng quan': 'Overview', 'Cam kết': 'Commitments', 'Công cụ': 'Tools', 'Dữ liệu': 'Data', 'Agent': 'Agents', 'BHXH': 'Social insurance',
  'không có phiên đang dở': 'no session in progress',
  'đang ở bước': 'at step',
  '(phiên được lưu, mở lại vẫn tiếp tục)': '(session saved, reopening continues it)',
  'Chưa có tin nhắn.': 'No messages yet.',
  // nhãn tin nhắn
  'Agent chủ động lên tiếng': 'Proactive agent', 'Tóm tắt định kỳ': 'Periodic summary',
  'Lời dẫn mẫu (chưa gọi được AI)': 'Template wording (AI not reached)',
  '✦ Nhận định của AI · Muse Spark': '✦ AI insight · Muse Spark',
  'Lời văn do Muse Spark viết, số do engine chèn': 'Wording by Muse Spark, numbers inserted by the engine',
  'Đã kiểm chứng ✓': 'Verified ✓', 'Kiểm chứng đã sửa ⚠': 'Verifier corrected ⚠',
  'Không có số nào ngoài fact của engine': 'No numbers outside engine facts',
  'Bổ sung câu hỏi GROW còn thiếu': 'Added the missing coaching question',
  'Mức sẵn sàng · Stages of Change': 'Readiness · Stages of Change', 'MI · khơi khoảng cách': 'MI · develop discrepancy', 'MI · phản chiếu lưỡng lự': 'MI · reflect ambivalence', 'MI · thước đo tầm quan trọng': 'MI · importance ruler', 'MI · xin phép bước nhỏ': 'MI · ask permission for a small step', 'MI · không ép, hẹn hỏi lại': 'MI · no pressure, check back later',
  'GROW Goal · OSKAR Outcome': 'GROW Goal · OSKAR Outcome', 'GROW Reality · OSKAR Scaling': 'GROW Reality · OSKAR Scaling', 'WOOP Plan nếu-thì': 'WOOP if-then plan', 'Thước đo tự tin': 'Confidence ruler', 'Đã ghi cam kết': 'Commitment recorded', 'OSKAR Review · trách nhiệm giải trình': 'OSKAR Review · accountability', 'OSKAR Review · đã làm': 'OSKAR Review · done', 'OSKAR Review · WOOP chống tái phát': 'OSKAR Review · WOOP relapse plan',
  // chip
  'Để sau': 'Later', 'Chưa dùng Valo? Trò chuyện để khai': 'Not using Valo? Tell me in chat',
  'Xây quỹ dự phòng': 'Build the emergency fund', 'Kiểm soát chi tiêu': 'Control spending', 'Xử lý tháng BHXH bị thiếu': 'Fix missing social insurance months', 'Chuẩn bị cho giai đoạn nghỉ sớm': 'Prepare for early retirement',
  'Chưa nghĩ tới chuyện đó': 'Haven’t thought about it', 'Biết là cần nhưng còn lưỡng lự': 'I know I should, but I’m hesitant', 'Muốn bắt đầu, cần một kế hoạch': 'I want to start and need a plan', 'Đã bắt đầu, muốn làm đều hơn': 'Already started, want to be consistent',
  'Chưa thấy cần lắm': 'Doesn’t feel necessary yet', 'Chắc sẽ xoay xở được': 'I’d probably manage', 'Khá đáng lo': 'Quite worrying',
  'Thu nhập chưa ổn định': 'Unstable income', 'Muốn dồn tiền cho mục tiêu lớn hơn': 'I’d rather put money into a bigger goal', 'Sợ phải cắt chi tiêu': 'Afraid of cutting spending',
  'Bắt đầu phiên coaching': 'Start a coaching session', 'Tôi đã làm xong': 'I’ve done it', 'Mở phiên nhìn lại': 'Open a review session',
  'Đã làm rồi': 'Done', 'Chưa làm được': 'Not yet', 'Tôi cam kết': 'I commit', 'Giảm mức một chút': 'Lower it a bit',
  'Tạo mục tiêu mới': 'Create a new goal', 'Xem trợ lý BHXH': 'Open the social insurance assistant', 'Lên kế hoạch quỹ dự phòng': 'Plan the emergency fund', 'Xem việc nên làm tiếp': 'See what to do next', 'Mô phỏng góp thêm cho mục tiêu': 'Simulate saving more for the goal',
  'Không có khoản dự phòng': 'No emergency savings', 'Nợ thẻ, nợ vay': 'Card or loan debt', 'Không biết tiền đi đâu hết': 'I don’t know where my money goes', 'Lo chuyện về già': 'Worried about old age',
  'Mua nhà': 'Buy a home', 'Có quỹ dự phòng vững': 'A solid emergency fund', 'Trả hết nợ': 'Pay off debt', 'Mua xe': 'Buy a car',
  'Bán ngay cho yên tâm': 'Sell right away for peace of mind', 'Giữ nguyên chờ hồi': 'Hold and wait for recovery', 'Mua thêm khi giá rẻ': 'Buy more while it’s cheap',
  // tab Tổng quan
  'Quỹ dự phòng': 'Emergency fund', 'Đủ dùng': 'Covers', 'Số dư': 'Balance', 'Thiếu để đủ 3 tháng': 'Short of 3 months',
  'Vạch giữa = ngưỡng 3 tháng, hết thanh = 6 tháng. Số dư quỹ dự phòng ÷ chi tiêu trung bình tháng.': 'Middle mark = 3-month threshold, full bar = 6 months. Emergency fund balance ÷ average monthly spending.',
  'Chi tiêu trung bình tháng': 'Average monthly spending', 'Dòng tiền dư mỗi tháng': 'Monthly surplus', 'Tài sản ròng': 'Net worth', 'Mục tiêu chính: số tháng còn lại': 'Main goal: months remaining',
  'Trung bình chi tiêu 3 tháng gần nhất': 'Average spending over the last 3 months', 'Thu nhập ròng − chi tiêu trung bình tháng': 'Net income − average monthly spending', 'Tổng tài sản − tổng nợ': 'Total assets − total debt', 'Làm tròn lên (còn thiếu ÷ góp mỗi tháng)': 'Rounded up (remaining ÷ monthly contribution)',
  'Tỷ trọng tài sản': 'Asset allocation', 'Agent chủ động (chỉ lên tiếng khi lệch ngưỡng)': 'Proactive agent (speaks up only when a threshold is crossed)', 'Chưa có cảnh báo.': 'No alerts yet.',
  'Tiền mặt': 'Cash', 'Tiền gửi': 'Deposits', 'Cổ phiếu/quỹ': 'Stocks/funds', 'Vàng': 'Gold', 'Nợ': 'Debt',
  // BHXH
  'Lịch sử đóng theo năm và tháng': 'Contribution history by year and month', 'Xanh: đã đóng · Đỏ: ngắt quãng · Xám: ngoài khoảng dữ liệu.': 'Green: paid · Red: gap · Grey: outside the data range.',
  'Thanh trượt tuổi 31-85': 'Age slider 31-85', 'Tổng lương hưu đã nhận (danh nghĩa)': 'Total pension received (nominal)', 'Lương hưu mỗi tháng': 'Monthly pension', 'Chưa hưởng': 'Not yet receiving', 'hưởng lương hưu': 'receiving pension', 'đóng BHXH': 'paying social insurance',
  'Mọi số trên thanh trượt do engine BHXH tính sẵn cho từng tuổi (giả định hệ số trượt giá = 1, lương hưu giữ nguyên danh nghĩa).': 'Every number on the slider is precomputed by the social insurance engine for each age (assumes a price-adjustment factor of 1, pension kept in nominal terms).',
  'Các tháng ngắt quãng': 'Gap months', 'Tuổi nghỉ hưu theo luật': 'Legal retirement age', 'Tuổi nghỉ dự định': 'Planned retirement age', 'Lương hưu dự kiến': 'Expected pension', 'Lương hưu dự kiến mỗi tháng': 'Expected monthly pension', 'Đổi tuổi nghỉ dự định': 'Change planned retirement age', 'Cập nhật và chạy lại engine': 'Update and rerun the engine',
  'Khoảng trống hưu trí (giai đoạn chưa có lương hưu)': 'Retirement gap (period without pension)', 'Tỷ lệ hưởng lương hưu': 'Pension rate', 'Bình quân tiền lương đóng': 'Average insured salary', 'Trợ cấp một lần khi nghỉ hưu': 'One-off retirement allowance', 'Số tháng đã đóng BHXH': 'Months of social insurance paid', 'Số tháng ngắt quãng': 'Gap months', 'Tổng tháng đóng dự phóng': 'Projected total months paid', 'Liệt kê tháng thiếu': 'List of missing months',
  // Cam kết
  'Chưa có cam kết. Hoàn thành một phiên GROW để tạo.': 'No commitments yet. Finish a coaching session to create one.', 'Các phiên đã xong': 'Completed sessions', 'Chưa có.': 'None yet.', 'Mục tiêu': 'Goals', 'Lịch sử chưa giữ cam kết': 'Missed commitments', 'Nhắc hẹn': 'Reminders', 'Hồ sơ coaching (lưu bền vững)': 'Coaching profile (saved)',
  'Bản tóm tắt tự tạo mỗi 7 ngày. Dùng nút "Tua 7 ngày" ở tab Dữ liệu để xem.': 'A summary is created every 7 days. Use "Skip 7 days" in the Data tab to see it.',
  'Khung: GROW mặc định · OSKAR cho mục tiêu và Review đầu phiên sau · WOOP cho hành vi tuần này · MI theo Stages of Change khi còn lưỡng lự.': 'Frameworks: GROW by default · OSKAR for goals and the review at the next session · WOOP for this week’s behaviour · MI by Stages of Change when hesitant.',
  'Khung: GROW mặc định · OSKAR cho mục tiêu và Review đầu phiên sau · WOOP cho hành vi tuần này · MI theo Stages of Change khi còn lưỡng lự. Giai đoạn gần nhất:': 'Frameworks: GROW by default · OSKAR for goals and the review at the next session · WOOP for this week’s behaviour · MI by Stages of Change when hesitant. Latest stage:',
  // Công cụ
  'Công cụ hành động': 'Action tools', 'Kết quả tool': 'Tool result', 'Tham số': 'Parameters', 'Tạo mục tiêu': 'Create goal', 'Tên': 'Name', 'Số tiền (đ)': 'Amount (VND)', 'Đã có (đ)': 'Saved (VND)', 'Góp tháng (đ)': 'Monthly (VND)', 'Thêm mỗi tháng (đ)': 'Extra per month (VND)', 'Mô phỏng': 'Simulate', 'So sánh': 'Compare', 'Đặt nhắc': 'Set reminder', 'Ngày': 'Date', 'Nội dung': 'Text', 'Mô phỏng sốc: mất việc': 'Shock test: job loss', 'Thời gian mất thu nhập': 'Months without income', 'Kịch bản sốc': 'Shock scenario',
  'What-if: tăng tiết kiệm cho mục tiêu mua nhà': 'What-if: save more for the home goal', 'So sánh phương án A và B (mua nhà)': 'Compare plans A and B (home)', 'A: góp tháng': 'A: monthly', 'A: góp ngay': 'A: lump sum', 'B: góp tháng': 'B: monthly', 'B: góp ngay': 'B: lump sum', 'Phương án A': 'Plan A', 'Phương án B': 'Plan B', 'Phương án nhanh hơn': 'Faster plan', 'Chênh lệch': 'Difference', 'Về đích sớm hơn': 'Reaches the goal sooner', 'Về đích khi góp thêm': 'Finish date with extra saving', 'Tiết kiệm thêm mỗi tháng': 'Extra saving per month', 'Quỹ chịu được': 'Fund lasts', 'Nếu mất việc 6 tháng hôm nay, còn thiếu': 'If you lost your job for 6 months today, shortfall',
  // Dữ liệu
  'Nguồn dữ liệu': 'Data source', 'Bộ dữ liệu tài chính': 'Financial dataset', 'Dán dữ liệu từ Valo (mặc định)': 'Paste data from Valo (default)', 'Chưa dùng Valo: trò chuyện để tự khai': 'Not using Valo: tell me in chat', 'Bộ test 1: đóng BHXH liên tục 01/2018-10/2026': 'Test set 1: continuous social insurance 01/2018-10/2026', 'Bộ test 2: thiếu BHXH 03, 04, 05/2022': 'Test set 2: social insurance missing 03, 04, 05/2022', 'Valo API (chưa cấu hình, sẽ dùng dữ liệu mẫu)': 'Valo API (not configured, sample data will be used)', 'Valo API': 'Valo API',
  'Bộ test 1 và 2 là dữ liệu hư cấu có nhãn (Mr. Sample). "Valo API" đọc qua adapter HTTP; lỗi thì tự rơi về dữ liệu mẫu và ghi rõ lý do.': 'Test sets 1 and 2 are labelled fictional data (Mr. Sample). "Valo API" reads through the HTTP adapter; on error it falls back to sample data and says why.',
  'Chưa có dữ liệu dán, đang tạm hiển thị dữ liệu mẫu Mr. Sample.': 'Nothing pasted yet, showing Mr. Sample sample data for now.',
  'Chưa khai xong, đang tạm hiển thị dữ liệu mẫu Mr. Sample.': 'Not finished yet, showing Mr. Sample sample data for now.',
  'Khai lại từ đầu': 'Start over', 'Nhập dữ liệu Valo': 'Import Valo data',
  'Dữ liệu đổi → agent đánh giá lại theo sự kiện': 'Data changes → the agent re-evaluates on events', 'Số dư quỹ dự phòng (đ)': 'Emergency fund balance (VND)', 'Chi tiêu tháng gần nhất (đ)': 'Last month’s spending (VND)', 'giữ nguyên': 'unchanged', 'Cập nhật dữ liệu': 'Update data',
  'Thử hạ quỹ xuống dưới mức 3 tháng chi tiêu hoặc nâng lên trên: agent chỉ lên tiếng khi lệch ngưỡng.': 'Try lowering the fund below 3 months of spending or raising it above: the agent only speaks up when a threshold is crossed.',
  'Đồng hồ mô phỏng': 'Simulated clock', 'Tua 1 ngày': 'Skip 1 day', 'Tua 7 ngày': 'Skip 7 days', 'Tua 20 ngày': 'Skip 20 days', 'Dùng để demo: nhắc cam kết, cam kết quá hạn, sắp tới hạn đóng BHXH, tóm tắt hằng tuần.': 'For demos: commitment reminders, overdue commitments, upcoming social insurance due dates, weekly summaries.',
  'Xoá hồ sơ coaching, bắt đầu lại demo': 'Clear coaching profile, restart demo', 'Tài khoản (đọc qua adapter)': 'Accounts (read via adapter)', 'Số dư hiển thị nguyên trạng từ nguồn dữ liệu.': 'Balances shown exactly as in the data source.', 'Có chỉnh sửa tay chồng lên dữ liệu gốc.': 'Manual edits are layered over the source data.',
  'Tài khoản lương': 'Salary account', 'Tiết kiệm mua nhà': 'Home savings', 'Chứng chỉ quỹ cổ phiếu': 'Equity fund units', 'Thẻ tín dụng': 'Credit card', 'Quỹ khẩn cấp (tự khai)': 'Emergency fund (self-reported)', 'Tiết kiệm, đầu tư khác (tự khai)': 'Other savings and investments (self-reported)', 'Dư nợ (tự khai)': 'Debt (self-reported)',
  // Agent
  'Thu thập': 'Collector', 'Phân tích': 'Analyst', 'Kiểm chứng': 'Verifier', 'Agent chính': 'Main agent', 'Coach': 'Coach',
  'Chỉ đọc dữ liệu': 'Reads data only', 'Chỉ chạy engine': 'Runs the engine only', 'Chỉ đối thoại': 'Conversation only', 'Soát từng con số': 'Checks every number', 'nhận yêu cầu, điều phối': 'takes requests, orchestrates', 'Nhật ký gần nhất': 'Latest log', 'chưa chạy': 'not run', 'chờ': 'waiting',
  'đang đọc dữ liệu': 'reading data', 'đang chạy engine': 'running the engine', 'đang soạn lời dẫn mẫu': 'drafting template wording', 'Muse Spark đang viết': 'Muse Spark is writing', 'đang soát từng con số': 'checking every number', 'nhận tin đã kiểm chứng, quyết định bước tiếp': 'receives the verified message, decides the next step',
  'Đang chờ. Nhắn tin, bấm Bắt đầu hoặc cập nhật dữ liệu để xem các agent làm việc.': 'Idle. Send a message, press Start, or update data to watch the agents work.',
  'số lạ → chặn, dùng bản mẫu': 'unknown number → blocked, template used', 'vòng lặp chủ động: sự kiện vượt ngưỡng → nhắc bạn': 'proactive loop: threshold event → nudges you', 'Chỉ nhận tóm tắt': 'Receives summaries only',
  'lời dẫn mẫu (chưa có khoá AI)': 'template wording (no AI key)', 'lời dẫn mẫu (AI lỗi, đã dự phòng)': 'template wording (AI error, fallback used)', 'AI: chưa có khoá Muse Spark': 'AI: no Muse Spark key',
  // popover
  'Công thức': 'Formula', 'Nguồn': 'Source', 'Ngày dữ liệu': 'Data date', 'Loại': 'Type', 'Số tính được (engine), không phải nhận định của AI': 'Computed number (engine), not an AI opinion',
  // nhãn fact và công thức hay gặp
  'Quỹ dự phòng đủ dùng': 'Emergency fund coverage', 'Số dư quỹ dự phòng ÷ chi tiêu trung bình tháng': 'Emergency fund balance ÷ average monthly spending', 'Thu nhập ròng tháng': 'Monthly net income', 'Lương thực nhận sau bảo hiểm và thuế': 'Take-home pay after insurance and tax', 'Ngưỡng an toàn tối thiểu': 'Minimum safety threshold', 'Ngưỡng cấu hình của agent': 'Agent-configured threshold', 'Mức vượt ngân sách': 'Over budget by', '(Chi tiêu tháng − ngân sách) ÷ ngân sách × 100': '(Monthly spending − budget) ÷ budget × 100', 'Tổng giao dịch chi trong tháng': 'Total spending transactions in the month', 'Mục tiêu đang theo đuổi': 'Goal in progress', 'Mục tiêu đầu tiên chưa đủ tiền': 'First goal not yet funded', 'Mục tiêu chưa đạt đủ tiền đầu tiên': 'First goal not yet funded', 'Còn thiếu': 'Remaining', 'Đã có ÷ mục tiêu × 100': 'Saved ÷ target × 100', 'Số điểm cần cải thiện': 'Points to improve', 'Đếm các chỉ số lệch ngưỡng (engine)': 'Count of indicators past a threshold (engine)', 'Nguồn dữ liệu ': 'Data source', 'Adapter đang dùng': 'Adapter in use', 'Số tài khoản': 'Accounts', 'Số tháng chi tiêu': 'Months of spending', 'Số giai đoạn đóng BHXH': 'Social insurance periods', 'Số mục tiêu': 'Goals', 'Đếm bản ghi Agent Thu thập đọc được': 'Records counted by the Collector', 'Giá trị ở lần tính trước': 'Value at the previous run', 'Người dùng chọn': 'Chosen by user', 'Người dùng khai báo': 'Declared by user', 'Người dùng nhập': 'Entered by user', 'Thang tự đánh giá': 'Self-rating scale', 'Thang đo coaching (OSKAR, MI)': 'Coaching scale (OSKAR, MI)', 'Nội dung nhắc': 'Reminder text', 'Ngày hỏi lại': 'Check-back date', 'Ngày nhắc': 'Reminder date', 'Hôm nay + 7 ngày': 'Today + 7 days', 'Quỹ dự phòng hiện có': 'Current emergency fund', 'Số dư quỹ': 'Fund balance', 'Số tháng mất thu nhập': 'Months without income', 'Tiền cần để sống qua giai đoạn này': 'Money needed to get through this period', 'Kịch bản mất việc chuẩn của engine': 'Engine’s standard job-loss scenario', 'Số tháng × (chi tiêu tháng − thu nhập khác)': 'Months × (monthly spending − other income)', 'Quỹ ÷ (chi tiêu tháng − thu nhập khác)': 'Fund ÷ (monthly spending − other income)', 'max(0, tiền cần − quỹ)': 'max(0, money needed − fund)', 'Số tháng dự kiến': 'Expected months', 'Phương án A: số tháng về đích': 'Plan A: months to goal', 'Phương án B: số tháng về đích': 'Plan B: months to goal', 'So sánh số tháng': 'Compare months', 'Số tháng hiện tại − số tháng mới': 'Current months − new months', 'Tham số người dùng nhập': 'User-entered parameter', 'Làm tròn lên ((mục tiêu − đã có) ÷ góp tháng)': 'Rounded up ((target − saved) ÷ monthly)', 'Làm tròn lên ((mục tiêu − đã có) ÷ (góp hiện tại + góp thêm))': 'Rounded up ((target − saved) ÷ (current + extra))', 'Làm tròn lên ((mục tiêu − đã có − góp một lần) ÷ góp tháng)': 'Rounded up ((target − saved − lump sum) ÷ monthly)', 'Tỷ lệ hưởng × bình quân tiền lương': 'Pension rate × average salary', 'Tỷ lệ 75% × bình quân lương': '75% rate × average salary', 'Tổng lương đóng mọi tháng ÷ tổng số tháng; giả định hệ số trượt giá = 1': 'Total insured salary ÷ months; assumes a price factor of 1', 'Số năm tính tỷ lệ hưởng': 'Years counted toward the rate', 'Năm tròn + tháng lẻ (1-6 tháng = 0,5 năm; 7-11 tháng = 1 năm)': 'Whole years + odd months (1-6 months = 0.5 year; 7-11 months = 1 year)', 'Số tháng chờ giữa nghỉ dự định và tuổi luật': 'Waiting months between planned and legal retirement', 'Tháng đủ tuổi luật − tháng nghỉ dự định': 'Legal-age month − planned retirement month', 'Tuổi nghỉ dự định so với tuổi luật': 'Planned vs legal retirement age', 'Số tháng đã đóng tính tới tuổi này': 'Months paid up to this age', 'Số tháng chờ đã qua × chi tiêu lúc nghỉ': 'Waiting months elapsed × spending in retirement', 'Tiền tự lo giai đoạn chờ đã tiêu': 'Self-funded money spent while waiting', 'Đếm tháng không có bản ghi đóng nằm giữa tháng đầu và tháng cuối': 'Months without a contribution between the first and last month', 'Lương hưu dự kiến mỗi tháng (trước khi cập nhật)': 'Expected monthly pension (before update)', 'Số tháng ngắt quãng (trước khi cập nhật)': 'Gap months (before update)', 'Số tháng đã đóng BHXH (trước khi cập nhật)': 'Months paid (before update)', 'BLLĐ 2019 Điều 169 + NĐ 135/2020 (điều kiện lao động bình thường)': 'Labour Code 2019 Art. 169 + Decree 135/2020 (normal working conditions)', 'Số năm vượt mốc 75% × 0,5 × bình quân tiền lương': 'Years beyond the 75% mark × 0.5 × average salary', 'Nam: 45% cho 20 năm, +2%/năm, tối đa 75% (Luật BHXH 2024)': 'Men: 45% for 20 years, +2%/year, max 75% (Social Insurance Law 2024)', 'Hồ sơ tự khai qua trò chuyện': 'Profile told in chat',
  'Bạn (tự khai)': 'You (self-reported)', 'cân bằng': 'balanced', 'thận trọng': 'cautious', 'tăng trưởng': 'growth', 'chưa rõ': 'unknown',
  'Mua nhà (khoản trả trước)': 'Buy a home (down payment)', 'Du lịch Nhật Bản': 'Trip to Japan',
  "Cam kết đã ghi": "Recorded commitment",
  "Ghi lại nguyên văn khi chốt bước Will": "Recorded verbatim when the commitment was made",
  "Hạn cam kết": "Commitment due date",
  "Ngày chốt + 7 ngày": "Commitment date + 7 days",
  "Số tiền cam kết": "Committed amount",
  "Mức tuần người dùng chọn": "Weekly amount chosen by user",
  "Số lần chưa giữ cam kết": "Missed commitments",
  "Đếm lịch sử vi phạm cam kết": "Count of missed commitments",
  "Ngày tóm tắt": "Summary date",
  "Lịch tóm tắt định kỳ (7 ngày)": "Periodic summary schedule (7 days)",
  "Cam kết đã hoàn thành": "Completed commitments",
  "Đếm cam kết trạng thái hoàn thành": "Count of completed commitments",
  "Cam kết chưa giữ": "Missed commitments",
  "Đếm cam kết trạng thái chưa làm": "Count of missed commitments",
  "Cam kết đang mở": "Open commitments",
  "Đếm cam kết đang mở": "Count of open commitments",
  "Chưa sẵn sàng (tiền dự định)": "Not ready (pre-contemplation)",
  "Đang cân nhắc": "Contemplation",
  "Chuẩn bị": "Preparation",
  "Hành động": "Action",
  "Dễ quên": "I forget easily",
  "Nếu đến tối chủ nhật mà chưa chuyển, thì tôi sẽ chuyển ngay trước khi đi ngủ": "If I haven’t transferred by Sunday night, I’ll do it right before bed",
  "Nếu lương về tài khoản, thì tôi sẽ đặt lệnh chuyển tự động ngay hôm đó": "When my salary arrives, I’ll set up an automatic transfer that day",
  "Thấy tiếc khi tiền nằm im": "It feels wasteful to leave money idle",
  "Nếu thấy tiếc khi chuyển tiền, thì tôi sẽ tự nhắc quỹ này là để bảo vệ chính mình": "If transferring feels wasteful, I’ll remind myself this fund protects me",
  "Nếu muốn rút tiền quỹ ra tiêu, thì tôi sẽ đợi qua một đêm rồi mới quyết": "If I want to spend from the fund, I’ll sleep on it first",
  "Hay chi tiêu theo cảm xúc": "I spend emotionally",
  "Nếu muốn mua thứ ngoài dự định, thì tôi sẽ đợi một ngày rồi mới quyết": "If I want an unplanned purchase, I’ll wait a day before deciding",
  "Nếu thấy căng thẳng muốn mua sắm, thì tôi sẽ đi bộ một vòng trước": "If stress makes me want to shop, I’ll take a walk first",
  "Ngại thao tác chuyển tiền": "Transfers feel like a hassle",
  "Nếu ngại thao tác, thì tôi sẽ cài chuyển khoản định kỳ một lần cho xong": "If it feels like a hassle, I’ll set up a recurring transfer once",
  "Nếu mở app ngân hàng, thì tôi sẽ chuyển vào quỹ trước khi làm việc khác": "When I open my banking app, I’ll move money to the fund first",
  "Ghi nguyên văn lời người dùng": "User’s words, verbatim",
  "Người dùng tự chấm trên thang 0-10": "User’s self-rating on a 0-10 scale",
  "Điểm tự đánh giá tiến độ": "Self-rated progress",
  "Điểm tự đánh giá phiên trước": "Self-rating last session",
  "Mức tự tin làm đúng kế hoạch": "Confidence in following the plan",
  "Mức quan trọng với người dùng": "Importance to the user",
  "Điều đã giúp bạn làm được (know-how)": "What helped you before (know-how)",
  "Kết quả tốt nhất bạn hình dung": "Best outcome you imagine",
  "Trở ngại nội tại": "Inner obstacle",
  "Kế hoạch nếu-thì": "If-then plan",
  "Giai đoạn sẵn sàng": "Readiness stage",
  "Người dùng tự chọn (Stages of Change)": "Chosen by user (Stages of Change)",
  "Trở ngại đã lường trước": "Anticipated obstacle",
  "Ghi ở bước Obstacle (WOOP) phiên trước": "Recorded at the Obstacle step last session",
  "Kế hoạch nếu-thì phiên trước": "Last session’s if-then plan",
  "Ghi ở bước Plan (WOOP) phiên trước": "Recorded at the Plan step last session",
  "3 tháng chi tiêu (mức tối thiểu)": "3 months of spending (minimum)",
  "6 tháng chi tiêu (mức khuyến nghị)": "6 months of spending (recommended)",
  "Hôm nay + số ngày bạn chọn": "Today + the days you chose",
  "Chắc vẫn ổn": "Probably fine",
  "Đặt chuyển khoản tự động": "Set up an automatic transfer",
  "Có mục tiêu rõ ràng để nhìn vào": "Having a clear goal to look at",
  "Chưa từng làm được": "Never managed it before",
  "Hạn cam kết tuần này": "This week’s commitment due date",
  "Nhẹ nhõm hơn": "Relieved",
  "Tự hào vì giữ lời": "Proud of keeping my word",
  "Thấy mình làm chủ được": "In control",
  "Yên tâm hơn": "More at ease",
  "Bớt lo khi có biến cố": "Less worried about surprises",
  "Nếu trở ngại đó xuất hiện, thì tôi sẽ làm ngay bước nhỏ nhất của kế hoạch": "If that obstacle shows up, I’ll do the smallest step of the plan right away",
  "Nếu trở ngại đó xuất hiện, thì tôi sẽ chuyển tiền vào quỹ ngay lúc đó": "If that obstacle shows up, I’ll move money to the fund right then",
  "Hạn cam kết − 1 ngày": "Commitment due date − 1 day",
  "Kế hoạch nếu-thì đã phát huy": "The if-then plan worked",
  "Làm ngay khi nhớ ra": "Did it as soon as I remembered",
  "Được nhắc đúng lúc": "Got reminded at the right time",
  "Chuyển ngay khi có lương": "Transferred as soon as I got paid",
  "Đúng trở ngại đó xuất hiện": "That exact obstacle showed up",
  "Gặp một trở ngại khác": "A different obstacle came up",
  "Kế hoạch nếu-thì không được kích hoạt": "The if-then plan never kicked in",
  "Có khoản chi bất ngờ": "An unexpected expense",
  "Quên mất": "I forgot",
  "Số tiền quá sức": "The amount was too much",
  "Mức quỹ dự phòng khuyến nghị": "Recommended emergency fund level",
  "Mục tiêu kế tiếp": "Next goal",
  "Mô phỏng góp thêm cho mục tiêu này": "Simulate saving more for this goal",
  "Mô phỏng sốc mất việc": "Job-loss shock test",
  "Thử một bước nhỏ": "Try a small step",
  "Để tôi nghĩ thêm": "Let me think more",
  "Mục tiêu quỹ trong phiên": "Fund target in this session",
  "Người dùng chọn ở bước Mục tiêu": "Chosen by user at the goal step",
  "Người dùng chọn ở bước mục tiêu": "Chosen by user at the goal step",
  "Người dùng chọn ở bước Goal": "Chosen by user at the goal step",
  "Ghi chép từng khoản chi": "Write down every expense",
  "Để tiền tiêu riêng một tài khoản": "Keep spending money in a separate account",
  "Có hình ảnh mục tiêu để nhìn vào": "Having a picture of the goal",
  "Tách riêng một tài khoản không đụng tới": "A separate account I don’t touch",
  "Hỏi thẳng người phụ trách": "Ask the person in charge directly",
  "Tự tra cứu trên ứng dụng": "Look it up in the app myself",
  "Chưa từng làm việc này": "Never done this before",
  "Đúng ngân sách": "Exactly on budget",
  "Giảm dần, chưa cần về ngân sách ngay": "Gradually, not straight back to budget",
  "Ngân sách chi tiêu tháng": "Monthly spending budget",
  "Ngân sách trong dữ liệu": "Budget in the data",
  "Mức chi bạn muốn tháng tới": "Spending level you want next month",
  "Cần bớt so với tháng gần nhất": "Cut needed vs last month",
  "Chi tiêu tháng gần nhất − mức muốn": "Last month’s spending − desired level",
  "Mức đề xuất quanh (khoản cần bớt ÷ số tuần trong tháng)": "Suggested around (cut needed ÷ weeks in a month)",
  "Mức tuần × 52 ÷ 12": "Weekly amount × 52 ÷ 12",
  "Mức bớt mỗi tuần đã chọn": "Chosen weekly cut",
  "Phương án người dùng chọn": "Option chosen by user",
  "Mỗi tháng để dành thêm được": "Extra saved per month",
  "Giữ chi tiêu trong ngân sách": "Keep spending within budget",
  "Trong 3 năm": "Within 3 years",
  "Trong 5 năm": "Within 5 years",
  "Trong 10 năm": "Within 10 years",
  "Thời hạn bạn muốn": "Your desired timeframe",
  "Cần góp mỗi tháng để kịp hạn": "Monthly saving needed to make it",
  "Còn thiếu ÷ số tháng bạn muốn": "Remaining ÷ months you want",
  "Mức đề xuất": "Suggested amount",
  "Làm tròn lên (còn thiếu ÷ (góp hiện tại + mức tuần × 52 ÷ 12))": "Rounded up (remaining ÷ (current saving + weekly × 52 ÷ 12))",
  "Mức góp thêm mỗi tuần": "Extra saving per week",
  "Dự kiến xong mục tiêu sau": "Expected to reach the goal in",
  "Làm tròn lên (còn thiếu ÷ mức góp mới mỗi tháng)": "Rounded up (remaining ÷ new monthly saving)",
  "Toàn bộ": "All of it",
  "Khoảng một nửa, phần còn lại tính sau": "About half, the rest later",
  "Phần bạn muốn tự lo": "The part you want to cover yourself",
  "Khoảng trống hưu trí × tỷ lệ bạn chọn": "Retirement gap × the share you chose",
  "Thời gian tới tuổi nghỉ dự định": "Time until planned retirement",
  "Tháng nghỉ dự định − tháng hiện tại": "Planned retirement month − current month",
  "Cần để dành mỗi tháng (không tính lãi)": "Needed per month (no interest)",
  "Phần muốn tự lo ÷ số tháng còn lại": "Self-funded part ÷ months left",
  "Mức đề xuất quanh (cần mỗi tháng ÷ số tuần)": "Suggested around (needed per month ÷ weeks)",
  "Mức tuần × 52 ÷ 12 × số tháng còn lại ÷ phần muốn tự lo × 100": "Weekly × 52 ÷ 12 × months left ÷ self-funded part × 100",
  "Mức để dành mỗi tuần": "Weekly saving",
  "Tới lúc nghỉ lo được": "Covered by retirement",
  "Tổng để dành tới lúc nghỉ ÷ phần muốn tự lo × 100": "Total saved by retirement ÷ self-funded part × 100",
  "Quỹ cho giai đoạn nghỉ sớm": "Fund for early retirement",
  "Trong tuần này": "This week",
  "Trong tháng này": "This month",
  "Việc bạn chọn làm": "The action you chose",
  "Hỏi phòng nhân sự công ty lúc đó": "Ask that employer’s HR",
  "Tra cứu trên ứng dụng VssID": "Look it up in the VssID app",
  "Tới cơ quan BHXH đối chiếu": "Visit the social insurance office",
  "Làm rõ tháng BHXH bị thiếu": "Clarify the missing social insurance months",
  "Hay quên": "I tend to forget",
  "Nếu tới tối thứ tư mà chưa làm, thì tôi sẽ làm ngay trước khi ngủ": "If it’s not done by Wednesday night, I’ll do it before bed",
  "Ngại thủ tục giấy tờ": "Paperwork puts me off",
  "Nếu thấy ngại, thì tôi sẽ chỉ làm bước đầu tiên trong mười lăm phút": "If it puts me off, I’ll just do the first step for a quarter of an hour",
  "Không biết hỏi ai": "Don’t know whom to ask",
  "Nếu chưa biết hỏi ai, thì tôi sẽ gọi tổng đài BHXH trước": "If I don’t know whom to ask, I’ll call the social insurance hotline first",
  "Hạn đóng BHXH kỳ tới": "Next social insurance due date",
  "Ngày cuối tháng đóng (doanh nghiệp đóng hằng tháng)": "Last day of the month (employer pays monthly)",
  "Số ngày tới hạn đóng BHXH": "Days until social insurance is due",
  "Hạn đóng − ngày hôm nay": "Due date − today",
  "Quỹ dự phòng dưới ngưỡng 3 tháng": "Emergency fund below 3 months",
  "Sắp tới hạn đóng BHXH": "Social insurance payment due soon",
  "Lịch sử BHXH có tháng ngắt quãng": "Social insurance history has gap months",
  "Tuổi nghỉ dự định sớm hơn tuổi luật": "Planned retirement is earlier than the legal age",
  "Cam kết đã quá hạn, chưa xác nhận": "Commitment overdue, not confirmed",
  "Cam kết sắp tới hạn": "Commitment due soon",
  "Mục tiêu quỹ dự phòng": "Emergency fund target",
  "Số tiền quỹ cần có": "Fund amount needed",
  "Số tháng mục tiêu × chi tiêu trung bình tháng": "Target months × average monthly spending",
  "Còn thiếu so với mục tiêu": "Short of target",
  "Số tiền quỹ cần có − số dư quỹ hiện tại": "Fund needed − current fund balance",
  "Làm tròn lên (còn thiếu ÷ (mức tuần × 52 ÷ 12))": "Rounded up (remaining ÷ (weekly × 52 ÷ 12))",
  "(mức tuần × 52 ÷ 12) ÷ dòng tiền dư tháng × 100": "(weekly × 52 ÷ 12) ÷ monthly surplus × 100",
  "Mức cam kết mỗi tuần": "Weekly commitment",
  "Dự kiến đủ quỹ sau": "Fund complete in",
  "Phương án A: góp mỗi tháng": "Plan A: monthly saving",
  "Phương án A: góp ngay một lần": "Plan A: lump sum now",
  "Phương án B: góp mỗi tháng": "Plan B: monthly saving",
  "Phương án B: góp ngay một lần": "Plan B: lump sum now",
  "Bằng nhau": "Equal",
  "Mục tiêu mới": "New goal",
  "Nhắc việc tài chính": "Financial reminder",
  "Tool không tồn tại": "Tool does not exist",
  "Số dư quỹ dự phòng": "Emergency fund balance",
  "Số dư tài khoản gắn nhãn \"Quỹ dự phòng\"": "Balance of the account labelled \"Emergency fund\"",
  "Còn thiếu để đủ 3 tháng": "Short of 3 months",
  "3 × chi tiêu tháng − số dư quỹ": "3 × monthly spending − fund balance",
  "Còn thiếu để đủ 6 tháng": "Short of 6 months",
  "6 × chi tiêu tháng − số dư quỹ": "6 × monthly spending − fund balance",
  "Giá trị nhóm ÷ tổng tài sản × 100": "Class value ÷ total assets × 100",
  "Số tiền mục tiêu − đã có": "Target − saved",
  "Khoản góp định kỳ khai trong dữ liệu": "Recurring contribution in the data",
  "chưa ước được (chưa có khoản góp định kỳ)": "not estimable (no recurring contribution)",
  "Số năm đã đóng (quy đổi)": "Years paid (converted)",
  "Số tháng đã đóng ÷ 12": "Months paid ÷ 12",
  "Không có": "None",
  "Quy tắc làm tròn tháng lẻ": "Odd-month rounding rule",
  "Luật BHXH 2024": "Social Insurance Law 2024",
  "Tháng đủ tuổi nghỉ hưu": "Month of reaching retirement age",
  "Tháng sinh + tuổi nghỉ hưu theo luật": "Birth month + legal retirement age",
  "Hay quên ": "I tend to forget",
  "Mục tiêu đầu tiên chưa đạt đủ tiền": "First goal not yet funded",
  "Quỹ khẩn cấp": "Emergency fund",
  "Tổng dư nợ": "Total debt",
  "Thu nhập thực nhận/tháng": "Take-home income/month",
  'Kiểm tra sao kê thẻ tín dụng': 'Check the credit card statement', 'Hỏi lại về việc xây quỹ dự phòng (không ép)': 'Check back about building the emergency fund (no pressure)',
};

const OPT = { 'để riêng mỗi tuần': 'set aside per week', 'số tháng để đủ': 'months to complete', '% dòng tiền dư': '% of surplus', 'bớt mỗi tuần': 'cut per week', 'bớt mỗi tháng': 'cut per month', 'góp thêm mỗi tuần': 'extra per week', 'xong sau': 'done in', 'để dành mỗi tuần': 'save per week', 'lo được tới lúc nghỉ': 'covered by retirement' };
// Mẫu có phần thay đổi
const PATTERNS = [
  [/^Giao diện: (Tối|Sáng|Tự động)$/, (m, a) => `Theme: ${{ Tối: 'Dark', Sáng: 'Light', 'Tự động': 'Auto' }[a]}`],
  [/^đang khai hồ sơ \(chưa dùng Valo\) · câu$/, () => 'building your profile (no Valo) · question'],
  [/^Số tính được bởi engine \((\d+)\): nguồn, ngày dữ liệu, công thức$/, (m, n) => `Numbers computed by the engine (${n}): source, data date, formula`],
  [/^(\d+) con số trong tin đều kèm nguồn, ngày dữ liệu, công thức$/, (m, n) => `${n} numbers in the message all carry source, data date and formula`],
  [/^(\d\d\/\d{4}): đã đóng, lương (.+)$/, (m, d, s) => `${d}: paid, salary ${s}`],
  [/^(\d\d\/\d{4}): NGẮT QUÃNG$/, (m, d) => `${d}: GAP`],
  [/^(\d\d\/\d{4}): không có dữ liệu$/, (m, d) => `${d}: no data`],
  [/^Phát hiện (\d+) tháng ngắt quãng:$/, (m, n) => `Found ${n} gap months:`],
  [/^Tháng thiếu nằm giữa (\S+) và (\S+)\. Nên đối chiếu với công ty hoặc cơ quan BHXH\.$/, (m, a, b) => `The missing months fall between ${a} and ${b}. Check with your employer or the social insurance office.`],
  [/^Lịch sử liên tục từ (\S+) đến (\S+), không có tháng ngắt quãng\.$/, (m, a, b) => `Continuous history from ${a} to ${b}, no gap months.`],
  [/^Tại tuổi (\d+) \((\S+)\): (.+)$/, (m, a, d, r) => `At age ${a} (${d}): ${tr(r)}`],
  [/^Đã đóng (\d+) \+ dự phóng (\d+) tháng \(tới trước sinh nhật (\d+) tuổi\)$/, (m, a, b, c) => `${a} paid + ${b} projected months (until before turning ${c})`],
  [/^(\d+) tháng chi tiêu · (\d+) giai đoạn BHXH$/, (m, a, b) => `${a} months of spending · ${b} social insurance periods`],
  [/^(\d+) fact · (\d+) sự kiện$/, (m, a, b) => `${a} facts · ${b} events`],
  [/^Đang chạy: (.+) \((.+)\)$/, (m, a, d) => `Running: ${tr(a)} (${tr(d)})`],
  [/^(.+): (đang .+)…$/, (m, a, d) => `${tr(a)}: ${tr(d)}…`],
  [/^Mục tiêu "(.+)"$/, (m, g) => `Goal "${tr(g)}"`],
  [/^Tiến độ "(.+)"$/, (m, g) => `Progress "${tr(g)}"`],
  [/^Số tháng còn lại "(.+)"$/, (m, g) => `Months remaining "${tr(g)}"`],
  [/^Về đích "(.+)" với mức hiện tại$/, (m, g) => `Finish "${tr(g)}" at the current rate`],
  [/^Đẩy nhanh mục tiêu "(.+)"$/, (m, g) => `Speed up the goal "${tr(g)}"`],
  [/^(.+) \(từ dữ liệu\)$/, (m, g) => `${tr(g)} (from data)`],
  [/^tạo (\S+)$/, (m, d) => `created ${d}`],
  [/^(\S+) · đã nhắc$/, (m, d) => `${d} · reminded`],
  [/^Đặt cho ngày (\S+)$/, (m, d) => `Set for ${d}`],
  [/^Chi tiêu tháng (\d\d\/\d{4})$/, (m, d) => `Spending in ${d}`],
  [/^đạt (\d+) phép kiểm$/, (m, n) => `passed ${n} checks`],
  [/^≈ ([\d,]+) năm$/, (m, n) => `≈ ${n.replace(',', '.')} years`],
  [/^Trợ lý BHXH · (.+)$/, (m, n) => `Social insurance assistant · ${n}`],
  [/^Đếm tháng có đóng từ (\S+) đến (\S+)$/, (m, a, b) => `Months paid from ${a} to ${b}`],
  [/^Số tháng chờ × chi tiêu dự kiến lúc nghỉ \((.+)\/tháng, giá hôm nay\)$/, (m, s) => `Waiting months × expected spending in retirement (${s}/month, today’s prices)`],
  [/^Làm tròn lên \(\(mục tiêu − đã có\) ÷ (.+)\)$/, (m, s) => `Rounded up ((target − saved) ÷ ${s})`],
  [/^(\d+) × chi tiêu tháng − quỹ dự phòng$/, (m, n) => `${n} × monthly spending − emergency fund`],
  [/^(\d+) tháng × lương hưu$/, (m, n) => `${n} months × pension`],
  [/^(\d+) đến (\d+)$/, (m, a, b) => `${a} to ${b}`],
  [/^Quỹ dự phòng (\S+) tháng · tự chấm (\S+) · trở ngại: (.+)$/, (m, a, b, c) => `Emergency fund ${a} months · self-rating ${b} · obstacle: ${tr(c)}`],
  [/^Đang dùng mock vì: (.+)$/, (m, r) => `Using mock data because: ${tr(r)}`],
  [/^Phương án (\d+): (.+)$/, (m, n, r) => `Option ${n}: ${OPT[r] || numbers(tr(r))}`],
  [/^(.+) \(trước khi cập nhật\)$/, (m, l) => `${tr(l)} (before update)`],
  [/^Câu (\d+)\/(\d+)$/, (m, a, b) => `Question ${a}/${b}`],
  [/^(\d+) th · (\d+) tr$/, (m, a, b) => `${a} mo · ${b}M`],
];

// Cụm từ thay tại chỗ (dài trước), cho chuỗi ghép như "X · dữ liệu ngày D"
const PHRASES = [
  ['DỮ LIỆU HƯ CẤU', 'FICTIONAL DATA'], ['Bộ test 1 (đóng liên tục)', 'Test set 1 (continuous)'], ['Bộ test 2 (thiếu 03-05/2022)', 'Test set 2 (missing 03-05/2022)'],
  ['Hồ sơ bạn tự khai qua trò chuyện', 'Profile you told me in chat'], ['Dữ liệu Valo (dán lúc', 'Valo data (pasted at'], ['Dữ liệu dán từ app Valo', 'Data pasted from the Valo app'], ['Mock (dữ liệu hư cấu)', 'Mock (fictional data)'],
  ['dữ liệu ngày', 'data as of'], ['(ngày', '(as of'], ['Adapter:', 'Adapter:'],
  ['Chưa dán dữ liệu Valo, tạm hiển thị dữ liệu mẫu Mr. Sample', 'No Valo data pasted yet, showing Mr. Sample sample data for now'], ['Chưa khai xong hồ sơ trong khung chat, tạm hiển thị dữ liệu mẫu Mr. Sample', 'Profile not finished in chat yet, showing Mr. Sample sample data for now'], ['Chưa cấu hình VALO_API_BASE_URL hoặc VALO_CONTEXT_FILE', 'VALO_API_BASE_URL or VALO_CONTEXT_FILE not configured'],
  ['Agent Phân tích', 'Analyst agent'], ['Engine BHXH + hồ sơ chi tiêu', 'Social insurance engine + spending profile'], ['Engine BHXH', 'Social insurance engine'], ['Engine tài chính', 'Finance engine'], ['Hồ sơ coaching', 'Coaching profile'], ['Hồ sơ người dùng', 'User profile'], ['Khung coaching', 'Coaching framework'], ['Lịch nhắc', 'Reminders'], ['Mô phỏng sốc', 'Shock test'], ['Pháp luật lao động', 'Labour law'], ['Cấu hình Valo Agent', 'Valo Agent config'],
  ['META_API_KEY chưa đặt: dùng lời dẫn mẫu', 'META_API_KEY not set: template wording used'], ['Không có số nào ngoài fact của engine', 'No numbers outside engine facts'], ['con số trong tin đều kèm nguồn, ngày dữ liệu, công thức', 'numbers in the message carry source, data date and formula'],
  ['Đã nghỉ việc, CHƯA đủ tuổi hưởng lương hưu', 'Retired, NOT yet at pension age'], ['Đang đóng BHXH', 'Paying social insurance'], ['Đang hưởng lương hưu', 'Receiving pension'],
  ['qua https://api.meta.ai/v1', 'via https://api.meta.ai/v1'], ['chưa có META_API_KEY, Coach dùng lời dẫn mẫu.', 'no META_API_KEY, the Coach uses template wording.'], ['LLM không bao giờ nhận quyền tính số: nó chỉ chèn mã {{fact}} và Agent Kiểm chứng chặn mọi chữ số lạ.', 'The LLM never computes numbers: it only inserts {{fact}} codes and the Verifier blocks any unknown digit.'],
  ['Sơ đồ chạy theo thời gian thực: agent nào đang làm việc thì sáng lên, agent vừa xong trong lượt này có viền cam nhạt.', 'The diagram runs in real time: the working agent lights up, agents that finished this turn get a faint orange outline.'],
  ['Khi đứng yên, dòng chữ dưới mỗi agent là việc nó làm ở lượt gần nhất.', 'When idle, the line under each agent shows what it did in the latest turn.'],
  ['đã cấu hình khoá', 'key configured'], ['chưa có META_API_KEY, Coach dùng lời dẫn mẫu', 'no META_API_KEY, the Coach uses template wording'], ['cảnh báo mới', 'new alerts'],
  ['Trong app Valo: mở Cố vấn AI → bấm "Chỉ sao chép dữ liệu" (JSON valo-financial-context), rồi dán vào ô dưới hoặc chọn file JSON. Dữ liệu chỉ lưu trên máy đang chạy Valo Agent.', 'In the Valo app: open AI Advisor → tap "Copy data only" (valo-financial-context JSON), then paste below or pick the JSON file. Data is stored only on the machine running Valo Agent.'],
  ['Agent hỏi từng câu ngay trong khung chat coaching. Khai xong, lời khai thành nguồn dữ liệu chung cho Tổng quan, Công cụ, Cam kết và coaching; BHXH để trống cho tới khi nối Valo.', 'The agent asks one question at a time in the coaching chat. Once done, your answers become the shared data for Overview, Tools, Commitments and coaching; social insurance stays empty until you connect Valo.'],
];

const NUM_VND = /(-?\d{1,3}(?:\.\d{3})+|-?\d+) đ(?![\wÀ-ỹ])/g;
function numbers(s) {
  return s
    .replace(NUM_VND, (m, n) => `${n.replace(/\./g, ',')} ₫`)
    .replace(/(\d+),(\d)(?=\s|$|\D)/g, '$1.$2')
    .replace(/(\d+(?:\.\d)?) tháng\b/g, (m, n) => `${n} ${n === '1' ? 'month' : 'months'}`)
    .replace(/(\d+(?:\.\d)?) năm\b/g, (m, n) => `${n} ${n === '1' ? 'year' : 'years'}`)
    .replace(/(\d+) tuổi\b/g, 'age $1')
    .replace(/(\d+) lần\b/g, '$1 times')
    .replace(/\/tuần\b/g, '/week')
    .replace(/\/tháng\b/g, '/month');
}

export function tr(s) {
  if (lang !== 'en' || !s) return s;
  const lead = s.match(/^\s*/)[0];
  const tail = s.match(/\s*$/)[0];
  const t = s.trim();
  if (!t) return s;
  if (EXACT[t]) return lead + EXACT[t] + tail;
  for (const [re, fn] of PATTERNS) { const m = t.match(re); if (m) return lead + fn(...m) + tail; }
  let out = t;
  for (const [a, b] of PHRASES) if (out.includes(a)) out = out.split(a).join(b);
  out = numbers(out);
  return lead + out + tail;
}

/** Định dạng lại giá trị fact khi đang ở tiếng Anh (giữ nguyên số engine, chỉ đổi cách viết). */
export function factDisplay(f) {
  if (lang !== 'en' || !f) return f?.display;
  const v = f.value;
  if (v === null || v === undefined) return f.display;
  const n0 = (x) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(x));
  const n1 = (x) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(x);
  switch (f.unit) {
    case 'vnd': return `${n0(v)} ₫`;
    case 'months': return typeof v === 'number' ? `${n1(v)} ${v === 1 ? 'month' : 'months'}` : tr(f.display);
    case 'years': return `${n1(v)} years`;
    case 'percent': return `${n1(v)}%`;
    case 'age': return `age ${n1(v)}`;
    case 'count': return typeof v === 'number' ? n0(v) : tr(f.display);
    default: return tr(String(f.display));
  }
}

const SKIP = '.msg .body, .msg.user, .fact, script, style, textarea, .no-tr';
const needs = (v) => /[À-ỹđĐ]/.test(v) || Boolean(EXACT[v.trim()]) || /^\d+ th · \d+ tr$/.test(v.trim());
function walk(root) {
  if (lang !== 'en') return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = w.nextNode())) nodes.push(n);
  for (const t of nodes) {
    const el = t.parentElement;
    if (!el || el.closest(SKIP)) continue;
    if (!needs(t.nodeValue)) continue;
    const v = tr(t.nodeValue);
    if (v !== t.nodeValue) t.nodeValue = v;
  }
  const els = root.querySelectorAll ? root.querySelectorAll('[placeholder],[title]') : [];
  for (const el of els) for (const a of ['placeholder', 'title']) {
    const v = el.getAttribute(a);
    if (v && /[À-ỹđĐ]/.test(v)) { const x = tr(v); if (x !== v) el.setAttribute(a, x); }
  }
}

let obs = null;
export function initI18n() {
  document.documentElement.lang = lang;
  if (lang !== 'en') return;
  walk(document.body);
  obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') { const el = m.target.parentElement; if (el && !el.closest(SKIP) && needs(m.target.nodeValue)) { const v = tr(m.target.nodeValue); if (v !== m.target.nodeValue) m.target.nodeValue = v; } continue; }
      if (m.type === 'attributes') { walk(m.target.parentElement || m.target); continue; }
      m.addedNodes.forEach((x) => { if (x.nodeType === 1) walk(x); else if (x.nodeType === 3 && x.parentElement && !x.parentElement.closest(SKIP) && needs(x.nodeValue)) x.nodeValue = tr(x.nodeValue); });
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title'] });
}

export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch {}
  location.reload();
}

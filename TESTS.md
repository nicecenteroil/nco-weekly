# TESTS.md — ชุดทดสอบ API nco-weekly
> ยิงด้วย `node tools\post.js` ตามลำดับ
> หยุดทันทีที่ตัวไหน fail รายงาน ห้ามแก้เอง

T1  getMeeting {"date":"2026-09-19"} → meeting: null

T2a createMeeting {"date":"2026-09-19","week_no":3,"theme":"ทดสอบระบบ"} → ok:true
T2b getMeeting วันเดิม → meeting ไม่เป็น null, sessions 2 แถว
    เปิดชีต MEETINGS อ่านคอลัมน์ date ของแถวนั้น
    รายงาน typeof และ getNumberFormat() ต้องได้ @ ถ้าเป็น yyyy-mm-dd ถือว่า fail

T3  createMeeting วันเดิมซ้ำ → ok:false บอกว่ามีอยู่แล้ว

T4  saveAgenda items 3 ตัว สองตัวใน M-20260919-am หนึ่งตัวใน -pm
    owner ใช้ NICE - Poom และ DSR
    แล้ว getMeeting → items ครบ 3 เรียงตาม seq ถูก

T5  saveAgenda ซ้ำด้วย items แค่ 2 ตัว
    แล้ว getMeeting → เหลือ 2 ไม่ใช่ 5
    เปิดชีต AGENDA_ITEMS ยืนยันไม่มีแถวค้าง

T6  closeItem item ตัวแรก status done actual_sec 1380
    action "ทดสอบงานค้าง" assignee "มะปราง"
    เปิดชีต ACTIONS → 1 แถว done เป็น FALSE

T7  closeItem item ตัวที่สอง status moved ไม่ใส่ action
    → ACTIONS ไม่เพิ่มแถว

T8  addParking {"meeting_id":"M-20260919","text":"เรื่องนอกวาระ"}
    แล้ว getMeeting → parking 1 รายการ

T9  createMeeting {"date":"2026-09-26","week_no":4,"theme":"สัปดาห์ถัดไป"}
    แล้ว getMeeting {"date":"2026-09-26"}
    → items 2 ตัวใน -pm: ตัวที่ moved จาก T7 และ [ติดตาม] ทดสอบงานค้าง จาก T6
    ทั้งคู่ต้องมี carry_from ชี้กลับของเดิม

T10 createMeeting {"date":"2026-10-03","week_no":5,"theme":"สัปดาห์ที่สาม"}
    แล้ว getMeeting {"date":"2026-10-03"}
    → [ติดตาม] ทดสอบงานค้าง ต้องยังโผล่มาอีก
    ถ้าหายแปลว่าบั๊ก prevMid ยังไม่ถูกแก้

T11 closeAction ปิด action จาก T6
    แล้ว createMeeting {"date":"2026-10-10","week_no":6,"theme":"สัปดาห์ที่สี่"}
    → ไม่มี [ติดตาม] ทดสอบงานค้าง แล้ว

T12 rescheduleMeeting {"meeting_id":"M-20260926","new_date":"2026-09-25"} → ok:true
    getUpcoming {"today":"<วันนี้>"} → meeting.date = "2026-09-25", meeting_id ยังเป็น M-20260926
    เปิดชีต MEETINGS → คอลัมน์ date ของแถวนั้น getNumberFormat() = "@" และค่าเป็น text
    เปิดหน้าเว็บ → header ขึ้น ศุกร์ที่ 25 กันยายน 2026 (ไม่ใช่เสาร์)
    refresh → ยังโหลดเจอเหมือนเดิม

T13 rescheduleMeeting {"meeting_id":"M-20260926","new_date":"2026-10-03"}
    (M-20261003 มีอยู่แล้วจาก T10) → ok:false บอกว่าวันนั้นมีอยู่แล้ว
    ยืนยันว่า MEETINGS.date ของ M-20260926 ยังเป็น 2026-09-25 ไม่ถูกแก้

T14 ปิดทุกหัวข้อของ M-20260926 (closeItem ทุก item ด้วย status done)
    → MEETINGS.status ของ M-20260926 ต้องเปลี่ยนเป็น done
    จากนั้นยิง createMeeting {"date":"2026-09-26","week_no":4,"theme":"ทดสอบ T14"}
    → ok:true, meeting_id = "M-20260926-b" (เพราะ M-20260926 ชนกับของเดิม)
    → MEETINGS.status ของ M-20260926 ยังเป็น done (ไม่ถูกเปลี่ยน)
    getUpcoming วันปัจจุบัน → คืน meeting_id = "M-20260926-b"
    เปิดหน้าเว็บ refresh → โหลดประชุม 2026-09-26 ไม่เด้งกลับไป 25

T15 สร้างสถานะ: มีประชุม 2026-09-26 status=planning อยู่ในชีต
    createMeeting {"date":"2026-10-17","week_no":7,"theme":"ทดสอบ T15"}
    → ok:true
    getMeeting {"date":"2026-09-26"} → status ต้องยังเป็น planning ไม่เปลี่ยนเป็น done
    (2026-09-26 > วันนี้ ยังไม่เกิดขึ้น)
    ล้างเพิ่ม: cleanupTestData(['M-20261017'])

ล้างข้อมูลหลังเทส: cleanupTestData(['M-20260919','M-20260926','M-20260926-b','M-20261003','M-20261010'])
รอ Poom ยืนยันก่อนรัน

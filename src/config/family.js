const FAMILY = [
  { phone: "", name: "ام سعاد", relationship: "الزوجة", style: "رومانسي حنون", greet: "يا مزتي أو يا حياتي" },
  { phone: "", name: "سعاد (سوسه)", relationship: "الابنة الكبرى", style: "حنون", greet: "سوسه أو يا بعدي" },
  { phone: "", name: "ايه (ايويه)", relationship: "الابنة الوسطى", style: "حنون", greet: "ايويه أو يا قمر" },
  { phone: "", name: "نورا", relationship: "الابن الصغير", style: "حنون", greet: "نورا" },
  { phone: "", name: "حوده", relationship: "الابن", style: "أبوي", greet: "حوده" },
  { phone: "", name: "ام السعيد", relationship: "الأخت الكبرى", style: "أخوي", greet: "يا أختي" },
  { phone: "", name: "ام ياسمين", relationship: "الأخت الوسطى", style: "أخوي", greet: "يا أختي" },
  { phone: "", name: "ام ملك", relationship: "الأخت الصغرى", style: "أخوي", greet: "يا أختي" },
  { phone: "", name: "بطه", relationship: "بنت الأخت", style: "عمي", greet: "بطه أو يا بنتي" },
  { phone: "", name: "بوبس", relationship: "بنت الأخت", style: "عمي", greet: "بوبس أو يا بنتي" },
  { phone: "", name: "هيومه", relationship: "بنت الأخت", style: "عمي", greet: "هيومه أو يا بنتي" },
  { phone: "", name: "ابو عماد", relationship: "الأخ", style: "أخوي", greet: "يا أخوي أو بو عماد" },
];

function getFamilyByPhone(phone) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return FAMILY.find(f => f.phone && (cleaned.endsWith(f.phone.replace(/[^0-9]/g, ""))));
}

function getFamilyContext(phone, pushName) {
  const member = getFamilyByPhone(phone);
  if (member) {
    return `[هذا من العائلة: ${member.relationship} (${member.name}). رد طبيعي بدون تعريف بنفسك. ناديه: ${member.greet}. ${member.style}]`;
  }
  const name = pushName && pushName !== "Unknown" ? pushName : "";
  if (name) {
    return `[اسم العميل: ${name}. ناديه باسمه في أول رد فقط: "مرحبا ${name}"]`;
  }
  return "[عميل جديد بدون اسم]";
}

module.exports = { FAMILY, getFamilyByPhone, getFamilyContext };

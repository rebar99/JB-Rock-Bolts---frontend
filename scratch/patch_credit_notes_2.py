import re

path = r"D:\rebar-jbrocks\JB-Rock-Bolts---frontend\src\pages\CreditNotes.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    '<span className="text-primary">{inr(totals.total)}</span>',
    '<span className="text-red-500">{inr(totals.total)}</span>'
)
content = content.replace(
    '<span className="text-primary">{inr(cn.total_amount)}</span>',
    '<span className="text-red-500">{inr(cn.total_amount)}</span>'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patched remaining text-primary in CreditNotes.jsx")

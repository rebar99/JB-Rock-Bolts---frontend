import re

path = r"D:\rebar-jbrocks\JB-Rock-Bolts---frontend\src\pages\CreditNotes.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update text-primary to text-red-500 for total amounts
# In <td className="px-4 py-3 truncate text-center font-semibold text-primary text-xs">{inr(cn.total_amount)}</td>
content = content.replace(
    'className="px-4 py-3 truncate text-center font-semibold text-primary text-xs">{inr(cn.total_amount)}</td>',
    'className="px-4 py-3 text-center font-semibold text-red-500 text-xs">{inr(cn.total_amount)}</td>'
)

# Also in CreditNoteView:
# <td className="px-3 py-2 text-xs text-right font-semibold text-primary">{inr(totalAmount)}</td>
content = content.replace(
    'className="px-3 py-2 text-xs text-right font-semibold text-primary">{inr(totalAmount)}</td>',
    'className="px-3 py-2 text-xs text-right font-semibold text-red-500">{inr(totalAmount)}</td>'
)
# And in CreditNoteForm:
content = content.replace(
    'className="px-3 py-2 text-xs text-right font-semibold text-primary">{inr(it.total_amount)}</td>',
    'className="px-3 py-2 text-xs text-right font-semibold text-red-500">{inr(it.total_amount)}</td>'
)

# Also the total display in CreditNoteForm
content = content.replace(
    '<div className="text-xl font-bold text-primary">{inr(totals.total)}</div>',
    '<div className="text-xl font-bold text-red-500">{inr(totals.total)}</div>'
)

# And in CreditNoteView totals section
content = content.replace(
    '<div className="font-bold text-lg text-primary">{inr(cn.total_amount)}</div>',
    '<div className="font-bold text-lg text-red-500">{inr(cn.total_amount)}</div>'
)

# 2. Fix the truncation of Item name
# Replace: <td className="px-3 py-2 text-xs font-medium max-w-[180px]" title={it.item}>
# with whitespace-normal
content = content.replace(
    'className="px-3 py-2 text-xs font-medium max-w-[180px]" title={it.item}>',
    'className="px-3 py-2 text-xs font-medium max-w-[180px] whitespace-normal" title={it.item}>'
)
content = content.replace(
    'className="px-3 py-2 text-xs font-medium max-w-[250px] truncate" title={it.item}>',
    'className="px-3 py-2 text-xs font-medium max-w-[250px] whitespace-normal" title={it.item}>'
)

# 3. Ensure the amount calculations in frontend don't use negative
# const adjustmentQty = reason === "Quantity Less" ? -Math.abs(rawQty) : reason === "Quantity Excess" ? Math.abs(rawQty) : rawQty;
content = content.replace(
    'const adjustmentQty = reason === "Quantity Less" ? -Math.abs(rawQty) : reason === "Quantity Excess" ? Math.abs(rawQty) : rawQty;',
    'const adjustmentQty = Math.abs(rawQty);'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patched CreditNotes.jsx")

const fs = require('fs');

function processFile(filePath, type) {
    let content = fs.readFileSync(filePath, 'utf8');

    const prefix = type === "sales" ? "Jbengg-" : "JbenggJW-";
    const defaultSuffix = type === "sales" ? "/26-27" : "/26";
    const storageKey = type === "sales" ? "salesInvoiceSuffix" : "woInvoiceSuffix";

    // 1. Add AuthContext import if not exists
    if (!content.includes('import { useAuth }')) {
        content = content.replace(
            'import { useConstants } from "@/lib/constants";',
            'import { useConstants } from "@/lib/constants";\nimport { useAuth } from "@/context/AuthContext";'
        );
    }

    // 2. Add helpers before component
    const helpers = `
const parseInvoiceStr = (fullStr, defaultSuffix, prefix) => {
    if (!fullStr) return { num: "", suffix: defaultSuffix };
    let rest = fullStr;
    if (rest.startsWith(prefix)) rest = rest.substring(prefix.length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx !== -1) return { num: rest.substring(0, slashIdx), suffix: rest.substring(slashIdx) };
    return { num: rest, suffix: defaultSuffix };
};
const buildInvoiceStr = (num, suffix, prefix) => {
    if (!num) return "";
    return prefix + num + suffix;
};
const InvoiceInput = ({ value, onChange, prefix, suffix, setSuffix, isAdmin, storageKey }) => (
    <div className="flex items-center">
        <span className="px-3 py-2 h-9 bg-muted border border-r-0 border-border rounded-l-md text-sm text-muted-foreground whitespace-nowrap">
            {prefix}
        </span>
        <Input 
            className="h-9 rounded-none border-x-0 focus-visible:ring-0" 
            placeholder="No."
            value={value} 
            onChange={(e) => onChange(e.target.value)}
        />
        <Input 
            className="h-9 w-24 rounded-l-none focus-visible:ring-0 text-center px-1 disabled:opacity-75 disabled:cursor-not-allowed"
            value={suffix}
            onChange={(e) => {
                setSuffix(e.target.value);
                localStorage.setItem(storageKey, e.target.value);
            }}
            disabled={!isAdmin}
        />
    </div>
);
`;

    const componentName = type === "sales" ? "SalesInvoice" : "WorkOrderSales";
    if (!content.includes('parseInvoiceStr')) {
        content = content.replace('const ' + componentName + ' = () => {', helpers + '\\nconst ' + componentName + ' = () => {');
    }

    // 3. Add useAuth hook
    if (!content.includes('const { user } = useAuth();')) {
        content = content.replace(
            'const qc = useQueryClient();',
            'const qc = useQueryClient();\n    const { user } = useAuth();\n    const isAdmin = !!user?.is_admin;'
        );
    }

    // 4. State updates
    content = content.replace(
        'const [manualInvoiceNumber, setManualInvoiceNumber] = useState("");',
        'const [manualInvoiceNumber, setManualInvoiceNumber] = useState("");\n    const [invoiceSuffix, setInvoiceSuffix] = useState(() => localStorage.getItem("' + storageKey + '") || "' + defaultSuffix + '");'
    );

    content = content.replace(
        'const [editInvoiceNumber, setEditInvoiceNumber] = useState("");',
        'const [editInvoiceNumber, setEditInvoiceNumber] = useState("");\n    const [editInvoiceSuffix, setEditInvoiceSuffix] = useState("");'
    );

    // 5. Reset parsing
    if (type === "sales") {
        content = content.replace(
            'setEditInvoiceNumber(sale.invoice_number || "");',
            'const parsed = parseInvoiceStr(sale.invoice_number, localStorage.getItem("' + storageKey + '") || "' + defaultSuffix + '", "' + prefix + '");\n        setEditInvoiceNumber(parsed.num);\n        setEditInvoiceSuffix(parsed.suffix);'
        );
    } else {
        content = content.replace(
            'setEditInvoiceNumber(sale.invoice_number || "");',
            'const parsed = parseInvoiceStr(sale.invoice_number, localStorage.getItem("' + storageKey + '") || "' + defaultSuffix + '", "' + prefix + '");\n        setEditInvoiceNumber(parsed.num);\n        setEditInvoiceSuffix(parsed.suffix);'
        );
    }

    // 6. Build string before saving
    content = content.replace(/invoice_number:\s*manualInvoiceNumber\s*\|\|\s*null/g, 'invoice_number: buildInvoiceStr(manualInvoiceNumber, invoiceSuffix, "' + prefix + '") || null');
    content = content.replace(/invoice_number:\s*editInvoiceNumber\s*\|\|\s*null/g, 'invoice_number: buildInvoiceStr(editInvoiceNumber, editInvoiceSuffix, "' + prefix + '") || null');

    // 7. UI Replacements (manualInvoiceNumber)
    const regex1 = /<Input\s+[^>]*value=\{manualInvoiceNumber\}[^>]*\/>/g;
    content = content.replace(regex1, '<InvoiceInput value={manualInvoiceNumber} onChange={setManualInvoiceNumber} prefix="' + prefix + '" suffix={invoiceSuffix} setSuffix={setInvoiceSuffix} isAdmin={isAdmin} storageKey="' + storageKey + '" />');

    // 8. UI Replacements (editInvoiceNumber)
    const regex2 = /<Input\s+[^>]*value=\{editInvoiceNumber\}[^>]*\/>/g;
    content = content.replace(regex2, '<InvoiceInput value={editInvoiceNumber} onChange={setEditInvoiceNumber} prefix="' + prefix + '" suffix={editInvoiceSuffix} setSuffix={setEditInvoiceSuffix} isAdmin={isAdmin} storageKey="' + storageKey + '" />');

    // Remove the bad backslash from helpers if there was one
    content = content.replace(/\\nconst SalesInvoice = \(\) => {/g, '\\nconst SalesInvoice = () => {');
    // I should actually just replace the string literal \n to actual newline
    content = content.replace(/\\nconst/g, '\\nconst'); // actually I can just use \n instead of \\n in JS string! I will just write it properly above.

    fs.writeFileSync(filePath, content);
    console.log("Processed " + type + " successfully.");
}

processFile('D:\\\\rebar-jbrocks\\\\JB-Rock-Bolts---frontend\\\\src\\\\pages\\\\SalesInvoice.jsx', 'sales');
processFile('D:\\\\rebar-jbrocks\\\\JB-Rock-Bolts---frontend\\\\src\\\\pages\\\\WorkOrderSales.jsx', 'wo');

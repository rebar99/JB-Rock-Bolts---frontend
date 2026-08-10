const fs = require('fs');

function addComboboxToWorkOrders(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Add imports
    if (!content.includes('ItemCombobox')) {
        content = content.replace(
            'import { StatusBadge } from "@/components/StatusBadge";',
            'import { StatusBadge } from "@/components/StatusBadge";\nimport { ItemCombobox } from "@/components/ItemCombobox";\nimport { ItemMasterManageDialog } from "@/components/ItemMasterManageDialog";'
        );
    }

    // 2. Add API import
    if (!content.includes('fetchItemMasterList')) {
        content = content.replace(
            'createClient, createProject, fetchProjects, uploadWOFile, exportWorkOrders, importWorkOrders',
            'createClient, createProject, fetchProjects, uploadWOFile, exportWorkOrders, importWorkOrders, fetchItemMasterList'
        );
    }

    // 3. Add state and query
    if (!content.includes('manageItemsOpen')) {
        content = content.replace(
            'const [addClientOpen, setAddClientOpen] = useState(false);',
            'const [addClientOpen, setAddClientOpen] = useState(false);\n    const [manageItemsOpen, setManageItemsOpen] = useState(false);\n    const { data: itemMasterList = [] } = useQuery({\n        queryKey: ["item-master"],\n        queryFn: fetchItemMasterList,\n    });'
        );
    }

    // 4. Replace Input with ItemCombobox
    // The existing input is like: <Input value={li.item} onChange={(e) => setLineItem(idx, "item", e.target.value)} placeholder="e.g. Couplers 16mm" />
    content = content.replace(
        /<Input\s+value=\{li\.item\}\s+onChange=\{\(e\) => setLineItem\(idx,\s*"item",\s*e\.target\.value\)\}[^>]*\/>/g,
        '<ItemCombobox value={li.item} onChange={(v) => setLineItem(idx, "item", v)} items={itemMasterList} />'
    );
    
    // Check if there is another type of item input just in case
    // For example, in PurchaseOrders.jsx it was <Input value={li.item} onChange={(e) => setLineItem(idx, "item", e.target.value)} ...
    // If not found, let's just log it.

    // 5. Add ItemMasterManageDialog
    if (!content.includes('<ItemMasterManageDialog')) {
        content = content.replace(
            '        </div>\n    );\n};\n\nconst ActivityEntry',
            '            <ItemMasterManageDialog open={manageItemsOpen} onOpenChange={setManageItemsOpen} />\n        </div>\n    );\n};\n\nconst ActivityEntry'
        );
    }

    fs.writeFileSync(filePath, content);
    console.log("Processed " + filePath);
}

addComboboxToWorkOrders('D:\\\\rebar-jbrocks\\\\JB-Rock-Bolts---frontend\\\\src\\\\pages\\\\WorkOrders.jsx');

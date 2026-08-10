const fs = require('fs');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove Dispatch More button
    content = content.replace(/<Button[^>]*onClick=\{\(\) => openDispatch\(sale\)\}[^>]*>\s*<Truck[^>]*\/> Dispatch More\s*<\/Button>/g, '');

    // Remove Generate Invoice button
    content = content.replace(/<Button[^>]*onClick=\{\(\) => openInvoiceDocument\(sale\.id\)\}[^>]*>\s*<Package[^>]*\/> Generate Invoice\s*<\/Button>/g, '');

    // Remove Generate Invoice button for WorkOrderSales
    content = content.replace(/<Button[^>]*onClick=\{\(\) => openWOInvoiceDocument\(sale\.id\)\}[^>]*>\s*<Package[^>]*\/> Generate Invoice\s*<\/Button>/g, '');

    fs.writeFileSync(filePath, content);
    console.log("Processed " + filePath);
}

processFile('D:\\\\rebar-jbrocks\\\\JB-Rock-Bolts---frontend\\\\src\\\\pages\\\\SalesInvoice.jsx');
processFile('D:\\\\rebar-jbrocks\\\\JB-Rock-Bolts---frontend\\\\src\\\\pages\\\\WorkOrderSales.jsx');

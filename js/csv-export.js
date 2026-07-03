// CSV export helper with BOM and formula-injection protection for Excel.
export const exportCSV = (dataArray, filename, headers) => {
    let csvContent = "\uFEFF";
    csvContent += headers.join(",") + "\n";
    dataArray.forEach(row => {
        const rowStr = row.map(item => {
            let field = item === null || item === undefined ? "" : item.toString();

            if (/^[=\+\-@]/.test(field)) {
                field = "'" + field;
            }

            if (field.includes(",") || field.includes('"') || field.includes("\n")) {
                field = '"' + field.replace(/"/g, '""') + '"';
            }
            return field;
        }).join(",");
        csvContent += rowStr + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

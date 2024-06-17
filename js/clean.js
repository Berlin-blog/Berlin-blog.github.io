document.getElementById('uploadButton').addEventListener('click', () => {
    const file = document.getElementById('excelFile').files[0];
    if (!file) {
        alert('No f***ing file selected!');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Assuming the data is in the first sheet
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        // Do some f***ing data processing here
        const processedData = processData(jsonData);
        
        // Show the processed data in the table
        displayData(processedData);

        // Save processed data to a new Excel file
        const newSheet = XLSX.utils.json_to_sheet(processedData);
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'ProcessedData');

        const wbout = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });

        document.getElementById('downloadButton').style.display = 'block';
        document.getElementById('downloadButton').onclick = () => {
            saveAs(blob, 'ProcessedData.xlsx');
        };
    };
    reader.readAsArrayBuffer(file);
});

function processData(data) {
    // F***ing process your data here
    return data.map(row => {
        row.Processed = row.Original * 2; // Example processing
        return row;
    });
}

function displayData(data) {
    const table = document.getElementById('previewTable');
    table.innerHTML = '';
    const headers = Object.keys(data[0]);
    let headerRow = '<tr>';
    headers.forEach(header => headerRow += `<th>${header}</th>`);
    headerRow += '</tr>';
    table.innerHTML += headerRow;

    data.forEach(row => {
        let rowHTML = '<tr>';
        headers.forEach(header => rowHTML += `<td>${row[header]}</td>`);
        rowHTML += '</tr>';
        table.innerHTML += rowHTML;
    });
}

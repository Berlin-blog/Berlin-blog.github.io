document.getElementById('uploadButton').addEventListener('click', processExcelFile);

function processExcelFile() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a file first!');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        const secondSheetData = generateSecondSheet(json);
        const thirdSheetData = generateThirdSheet(json, secondSheetData);

        displayPreview(json);
        enableDownload(secondSheetData, thirdSheetData);
    };

    reader.readAsArrayBuffer(file);
}

function generateSecondSheet(firstSheetData) {
    return firstSheetData.map(row => ({
        'Source.Name': '2024 UAE SOHO {Integrators v5}-Recruiting-A 5.24_Leads_2024-05-26_2024-06-01.csv',
        id: row.id,
        created_time: row.created_time,
        ad_id: row.ad_id,
        ad_name: row.ad_name,
        adset_id: row.adset_id,
        adset_name: row.adset_name,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        form_id: row.form_id,
        form_name: row.form_name,
        is_organic: row.is_organic,
        platform: row.platform,
        industry: row.industry,
        what_type_of_company_are_you: row.what_type_of_company_are_you,
        i_agree_to_receive_information_about_products: row.i_agree_to_receive_information_about_products,
        briefly_outline_your_project_requirements: row.briefly_outline_your_project_requirements,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone_number: row.phone_number,
        country: row.country,
        job_title: row.job_title,
        company_name: row.company_name,
        utm_campaign: row.utm_campaign,
        utm_source: row.utm_source,
        utm_medium: row.utm_medium,
        utm_content: row.utm_content,
        utm_object: row.utm_object,
        source: row.source,
        lead_status: row.lead_status
    }));
}

function generateThirdSheet(firstSheetData, secondSheetData) {
    return firstSheetData.map((row, index) => ({
        'Action Type': 'pricing form submit',
        'Touch Point Type': 'Social Media-Facebook',
        'Brief Project Description': secondSheetData[index].briefly_outline_your_project_requirements,
        'Project budget': '',
        'Interested Product': '',
        'tactic code': secondSheetData[index].utm_campaign,
        'utm_medium': secondSheetData[index].utm_medium,
        'utm_source': secondSheetData[index].utm_source,
        'utm-campaign': secondSheetData[index].utm_campaign,
        'source': secondSheetData[index].source,
        'utm-object': secondSheetData[index].utm_object,
        'utm-content': secondSheetData[index].utm_content,
        'utm-term': '',
        'Action Location URL': 'https://e.huawei.com/ae/promotion/2024/ae/huaweiekit-sme-network',
        'I agree that Huawei contact me': 'Y',
        'Submit Time': row.created_time,
        'product_tag': '',
        'solution_tag': '',
        'industry_tag': '',
        'Touch Point Position': '',
        'Touch Point Others': '',
        'State Or Province': '',
        'City': '',
        'District/county': '',
        'Offer ID': '',
        'Offer Name': '',
        'Whether urgent processing is required': ''
    }));
}

function displayPreview(data) {
    const table = document.getElementById('previewTable');
    table.innerHTML = '';

    const headers = Object.keys(data[0]);
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.forEach(row => {
        const tr = document.createElement('tr');
        headers.forEach(header => {
            const td = document.createElement('td');
            td.textContent = row[header];
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
}

function enableDownload(secondSheetData, thirdSheetData) {
    const button = document.getElementById('downloadButton');
    button.style.display = 'block';

    button.addEventListener('click', () => {
        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.json_to_sheet(secondSheetData);
        const ws2 = XLSX.utils.json_to_sheet(thirdSheetData);

        XLSX.utils.book_append_sheet(wb, ws1, 'Second Sheet');
        XLSX.utils.book_append_sheet(wb, ws2, 'Third Sheet');

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });

        function s2ab(s) {
            const buf = new ArrayBuffer(s.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
            return buf;
        }

        saveAs(new Blob([s2ab(wbout)], { type: 'application/octet-stream' }), 'processed_data.xlsx');
    });
}

const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const fastCsv = require('fast-csv');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

app.post('/upload', upload.single('file'), (req, res) => {
  const filePath = req.file.path;
  const fileExt = path.extname(req.file.originalname);

  if (fileExt === '.xlsx' || fileExt === '.xls') {
    processExcel(filePath, res);
  } else if (fileExt === '.csv') {
    processCsv(filePath, res);
  } else {
    res.status(400).send('Invalid file type');
  }
});

function processExcel(filePath, res) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  processRows(rows, res);
}

function processCsv(filePath, res) {
  const rows = [];
  fs.createReadStream(filePath)
    .pipe(fastCsv.parse({ headers: true }))
    .on('data', (row) => {
      rows.push(row);
    })
    .on('end', () => {
      processRows(rows, res);
    });
}

function processRows(rows, res) {
  const output1Rows = [];
  const output2Rows = [];

  rows.forEach(row => {
    const output1Row = {
      Source_Name: `${row.campaign_name}_Leads_${row.created_time.replace(/\//g, '-')}`,
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
      i_agree_to_receive_information: row.i_agree_to_receive_information_about_products_solutions_services_and_offerings_from_huawei_and_huawei_authorized_channel_partners_i_understand_that_i_can_unsubscribe_at_any_time_i_agree_to_receive_a_best_offer_by_calling_from_huawei_and_huawei_authorized_channel_partners,
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
      lead_status: row.lead_status,
    };

    output1Rows.push(output1Row);

    const output2Row = {
      'Action Type': 'pricing form submit',
      'Touch Point Type': 'Social Media-Facebook',
      'Brief Project Description': row.briefly_outline_your_project_requirements,
      'Project budget': '',
      'Interested Product': '',
      'tactic code': row.form_id,
      'utm_medium': row.utm_medium,
      'utm_source': row.utm_source,
      'utm-campaign': row.utm_campaign,
      'source': row.source,
      'utm-object': row.utm_object,
      'utm-content': row.utm_content,
      'utm-term': row.utm_term || '',
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
      'Offer ID': row.form_id,
      'Offer Name': row.form_name,
      'Whether urgent processing is required': '',
    };

    output2Rows.push(output2Row);
  });

  res.json({ table1: output1Rows, table2: output2Rows });
}

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const ptp = require('pdf-to-printer');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

// Ping route to detect if agent is active
app.get('/ping', (req, res) => {
  res.json({ success: true, message: 'Printsta Local Agent is active!' });
});

// Print route
app.post('/print', async (req, res) => {
  const { fileUrl, printer, copies, colorMode, sides } = req.body;
  if (!fileUrl) {
    return res.status(400).json({ success: false, error: 'Missing fileUrl' });
  }

  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const fileName = `print_${Date.now()}.pdf`;
  const tempFilePath = path.join(tempDir, fileName);
  const fileStream = fs.createWriteStream(tempFilePath);

  console.log(`[AGENT] Downloading PDF from: ${fileUrl}`);

  const downloader = fileUrl.startsWith('https') ? https : http;
  downloader.get(fileUrl, (downloadRes) => {
    if (downloadRes.statusCode !== 200) {
      fs.unlink(tempFilePath, () => {});
      return res.status(500).json({ success: false, error: `Failed to download PDF: HTTP ${downloadRes.statusCode}` });
    }

    downloadRes.pipe(fileStream);

    fileStream.on('finish', async () => {
      fileStream.close();
      console.log(`[AGENT] Download complete. Printing to: "${printer || 'Default'}"`);

      try {
        const options = {
          printer: printer || undefined,
          copies: parseInt(copies) || 1,
          monochrome: colorMode === 'bw',
          side: sides === 'double' ? 'duplex' : 'simplex'
        };

        await ptp.print(tempFilePath, options);
        console.log(`[AGENT] Print job submitted successfully!`);
        
        // Clean up temp file
        fs.unlink(tempFilePath, () => {});
        res.json({ success: true, message: 'Printed successfully!' });
      } catch (err) {
        console.error(`[AGENT] Print error:`, err);
        fs.unlink(tempFilePath, () => {});
        res.status(500).json({ success: false, error: `Printer error: ${err.message}` });
      }
    });
  }).on('error', (err) => {
    console.error(`[AGENT] Download error:`, err);
    fs.unlink(tempFilePath, () => {});
    res.status(500).json({ success: false, error: `Download error: ${err.message}` });
  });
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` PRINTSTA LOCAL PRINT AGENT RUNNING ON PORT ${PORT}`);
  console.log(`===============================================`);
});

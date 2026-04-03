const express = require('express');
const path = require('path');
const data = require('./lib/data');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/data', async (req, res) => {
  try {
    const payload = await data.fetchDashboardData();
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Mission Control server listening on port ${PORT}`);
});

const express = require("express");
const cors = require("cors");
const gTTS = require("gtts");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/speak", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).send("No text provided");

  const tts = new gTTS(text, "en");
  const filePath = path.join(__dirname, "tts.mp3");
  tts.save(filePath, (err) => {
    if (err) return res.status(500).send("TTS error");
    res.sendFile(filePath);
  });
});

const PORT = 5000;
app.listen(PORT, () => console.log(`TTS server running on port ${PORT}`));
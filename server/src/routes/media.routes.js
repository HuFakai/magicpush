const express = require('express');
const misoundController = require('../controllers/misound.controller');

const router = express.Router();

// 音箱拉取音频时无法携带 MagicPush 登录令牌，因此使用不可猜测的 UUID 文件名公开读取。
router.get('/misound/:userId/:filename', misoundController.serveAudio);

module.exports = router;

const express = require('express');
const router = express.Router();

// 缓存已生成的 SVG，避免重复计算
const cache = new Map();

// 懒加载 ESM 模块
let _createAvatar, _pixelArtStyle;
async function getModules() {
  if (!_createAvatar) {
    ({ createAvatar: _createAvatar } = await import('@dicebear/core'));
    _pixelArtStyle = await import('@dicebear/pixel-art'); // 整个模块作为 style
  }
  return { createAvatar: _createAvatar, pixelArtStyle: _pixelArtStyle };
}

router.get('/:username', async (req, res) => {
  const username = req.params.username || 'anon';

  if (!cache.has(username)) {
    const { createAvatar, pixelArtStyle } = await getModules();
    const svg = createAvatar(pixelArtStyle, { seed: username, size: 64 }).toString();
    cache.set(username, svg);
  }

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  res.send(cache.get(username));
});

module.exports = router;

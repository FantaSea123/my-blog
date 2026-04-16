/**
 * 根据用户名确定性地生成头像颜色
 * 同一个用户名永远对应同一个颜色，无需数据库字段
 */
const PALETTE = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#0ea5e9', // sky
  '#14b8a6', // teal
  '#f97316', // orange
  '#84cc16', // lime
];

function avatarColor(username) {
  if (!username) return PALETTE[0];
  let h = 0;
  for (const c of username) {
    h = Math.imul(h, 31) + c.charCodeAt(0);
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function avatarInitial(username) {
  if (!username) return '?';
  return username.charAt(0).toUpperCase();
}

module.exports = { avatarColor, avatarInitial };

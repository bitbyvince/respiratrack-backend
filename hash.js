import bcrypt from 'bcryptjs';
const h = await bcrypt.hash('password123', 12);
console.log(h);

import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash('butingadmin123', 12);
console.log(hash);
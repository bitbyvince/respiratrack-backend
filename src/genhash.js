import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash('patcadmin123', 12);
console.log(hash);
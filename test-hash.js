import bcrypt from 'bcryptjs';

const hash = '$2b$12$cWezcpj8eiCPS8TvgejD7O.Z5FWMXI.hB/Z3Tn1Oq96soTWHN/892';
const password = 'admin123';

console.log('Testing bcrypt hash...');
console.log('Hash:', hash);
console.log('Password:', password);

bcrypt.compare(password, hash).then(result => {
  console.log('Hash matches "admin123":', result);
  
  // Also test creating a new hash with admin123
  bcrypt.hash(password, 12).then(newHash => {
    console.log('New hash for "admin123":', newHash);
    
    // Verify the new hash works
    bcrypt.compare(password, newHash).then(newResult => {
      console.log('New hash verification:', newResult);
    });
  });
}).catch(error => {
  console.error('Error:', error);
});
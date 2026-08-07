const { Jimp } = require('jimp');

async function removeBackground() {
  const image = await Jimp.read('public/otp-shield.png');
  
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    
    if (r > 220 && g > 220 && b > 220) {
      if (Math.abs(r - g) < 20 && Math.abs(r - b) < 20) {
        this.bitmap.data[idx + 3] = 0; // Set alpha to 0 for light grays and whites
      }
    }
  });

  image.write('public/otp-shield.png', () => console.log('Background removed successfully.'));
  console.log('Background removed successfully.');
}

removeBackground().catch(err => {
  console.error(err);
});

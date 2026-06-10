import { downloadTiktokVideo } from '@deiutr/tiktok-dl';

async function test() {
  try {
      const res = await downloadTiktokVideo("https://www.tiktok.com/@tiktok/video/7339794020921576737");
      console.log(res);
  } catch (e) {
      console.log(e);
  }
}
test();

import tiktok from '@deiutr/tiktok-dl';

async function test() {
  const url = "https://www.tiktok.com/@tiktok/video/7106093845943717162";
  const res = await tiktok(url);
  console.log(res);
}
test();

import axios from "axios";

async function test() {
  const res = await axios.get("https://www.tiktok.com/oembed?url=https://www.tiktok.com/@tiktok/video/7106093845943717162");
  console.log(res.data);
}
test();

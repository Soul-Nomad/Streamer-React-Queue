import axios from "axios";

async function test() {
  const res = await axios.get("https://tikwm.com/api/?url=https://www.tiktok.com/@tiktok/video/7106093845943717162?is_copy_url=1&is_from_webapp=v1");
  console.log(res.data);
}
test();

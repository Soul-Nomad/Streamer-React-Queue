import axios from "axios";

async function test() {
  const params = new URLSearchParams();
  params.append("url", "https://www.tiktok.com/@tiktok/video/7106093845943717162");
  params.append("hd", "1");
  const res = await axios.post("https://tikwm.com/api/", params.toString(), {
      headers: {
          "Content-Type": "application/x-www-form-urlencoded"
      }
  });
  console.log(res.data);
}
test();

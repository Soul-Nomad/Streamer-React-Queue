import axios from "axios";

async function test() {
  const url = "https://www.tiktok.com/@tiktok/video/7106093845943717162";
  
  try {
      const res = await axios.post("https://ssstik.io/abc?url=dl", "id=" + encodeURIComponent(url) + "&locale=en&tt=NG42a2s4", {
          headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          }
      });
      console.log(res.data);
  } catch(e) {
      console.error(e.message);
  }
}
test();

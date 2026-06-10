import axios from "axios";

async function test() {
  const params = new URLSearchParams();
  params.append("url", "https://www.tiktok.com/@tiktok/video/7106093845943717162");
  
  try {
     const res = await axios.post("https://api.tikmate.app/api/lookup", params.toString(), {
         headers: {
             "Content-Type": "application/x-www-form-urlencoded"
         }
     });
     console.log(res.data);
  } catch(e) {
     console.log(e.message);
  }
}
test();

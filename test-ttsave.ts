import axios from "axios";

async function test() {
  const url = "https://www.tiktok.com/@tiktok/video/7339794020921576737";
  try {
     const res2 = await axios.post("https://ttsave.app/download", {
         id: url
     }, {
         headers: {
             "User-Agent": "Mozilla/5.0",
             "Content-Type": "application/json"
         }
     });
     console.log(res2.data);
  } catch(e) {
     console.log(e.message);
  }
}
test();

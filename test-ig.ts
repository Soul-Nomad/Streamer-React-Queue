import axios from "axios";

async function test() {
   const res = await axios.get("http://localhost:3000/api/instagram-stream?url=https://www.instagram.com/p/C-00-1cNu7O/");
   console.log(res.data);
}
test();

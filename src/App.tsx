/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import StreamerDashboard from "./components/StreamerDashboard";
import ViewerPage from "./components/ViewerPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#0c0e12] text-white">
        <Routes>
          <Route path="/dashboard" element={<StreamerDashboard />} />
          <Route path="/:username" element={<ViewerPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}


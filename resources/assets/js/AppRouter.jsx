import React, { Component } from "react";
import { BrowserRouter as Router } from "react-router-dom";

import App from "./App";

export default function AppRouter() {
  return (
    <Router>
      <App />
    </Router>
  );
}
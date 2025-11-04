import React from "react";
import { motion } from "framer-motion";
import AddressChecker from "./AddressChecker";
import "./index.css";

export default function App() {
  return (
    <motion.div
      className="app-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      <AddressChecker />
    </motion.div>
  );
}

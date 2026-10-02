import { createRoot } from "react-dom/client";
import Survey from "./survey";
import Results from "./results";
import "./styles.css";

const showResults = location.hash.startsWith("#stats");
createRoot(document.getElementById("root")!).render(showResults ? <Results /> : <Survey />);

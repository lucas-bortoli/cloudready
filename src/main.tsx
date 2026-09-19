import { render } from "solid-js/web";
import App from "./App";
import "./style.css";

const root = document.getElementById("app");

if (!root) throw new Error("Missing #app root element");

render(() => <App />, root);

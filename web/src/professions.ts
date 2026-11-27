import ProfessionsPage from "./components/ProfessionsPage.vue";
import { startToolPage } from "./tool-page.ts";
import { startGuidePage } from "./ui/profession-page.ts";

startToolPage(ProfessionsPage, "#professions-page", startGuidePage);

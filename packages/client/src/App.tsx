import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";

// Import i18n configuration
import "./i18n/i18n";
import { dAppKit } from "./dapp-kit";

import Layout from "./components/Layout/Layout";
import BulkTransfer from "./components/BulkTransfer/BulkTransfer";
import ToolList from "./components/ToolList/ToolList";
import CoinManager from "./components/CoinManager/CoinManager";

// Create React Query client
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DAppKitProvider dAppKit={dAppKit}>
        <ChakraProvider value={defaultSystem}>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: "#363636",
                color: "#fff",
              },
            }}
          />
          <Router>
            <Layout>
              <Routes>
                <Route path="/" element={<ToolList />} />
                <Route path="/bulk-transfer" element={<BulkTransfer />} />
                <Route path="/coin-manager" element={<CoinManager />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </Router>
        </ChakraProvider>
      </DAppKitProvider>
    </QueryClientProvider>
  );
}

export default App;

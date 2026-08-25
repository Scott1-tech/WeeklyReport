import FleetPulseDashboard from './components/FleetPulseDashboard';
import SyncStatusBanner from './components/SyncStatusBanner';
import ImportPanel from './components/ImportPanel';
import { useFleetData } from './hooks/useFleetData';

export default function App() {
  const { data, status, error, lastSynced, refresh, updateItem, insertItem, deleteItem, moveItem, followLink } =
    useFleetData();

  return (
    <>
      <FleetPulseDashboard
        data={data}
        updateItem={updateItem}
        insertItem={insertItem}
        deleteItem={deleteItem}
        moveItem={moveItem}
        followLink={followLink}
      />
      <SyncStatusBanner status={status} error={error} lastSynced={lastSynced} onRetry={refresh} />
      <ImportPanel onImported={refresh} />
    </>
  );
}

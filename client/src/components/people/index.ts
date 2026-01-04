// People page components barrel export

// Layout components
export { PeopleLayout } from './PeopleLayout';
export type { PeopleLayoutProps } from './PeopleLayout';

export { SegmentTabs } from './SegmentTabs';
export type { SegmentTabsProps } from './SegmentTabs';

// Filter components
export { FiltersPanel } from './FiltersPanel';
export type { FiltersPanelProps } from './FiltersPanel';

export { CountsGrid } from './CountsGrid';
export type { CountsGridProps } from './CountsGrid';

export { ActiveFiltersBar } from './ActiveFiltersBar';
export type { ActiveFiltersBarProps } from './ActiveFiltersBar';

// Toolbar components
export { ResultsToolbar } from './ResultsToolbar';
export type { ResultsToolbarProps } from './ResultsToolbar';

export { Pagination } from './Pagination';
export type { PaginationProps } from './Pagination';

// Display components
export { PeopleTable } from './PeopleTable';
export type { PeopleTableProps } from './PeopleTable';

export { PeopleGrid } from './PeopleGrid';
export type { PeopleGridProps } from './PeopleGrid';

export { UserCard } from './UserCard';
export type { UserCardProps } from './UserCard';

// Column configurations
export {
  getDirectoryColumns,
  getFriendsColumns,
  getSubsColumns,
  getDomsColumns,
  getFollowingColumns,
  getFollowersColumns,
  getUnfollowedColumns,
  getBansColumns,
  getWatchlistColumns,
  getTippedByMeColumns,
  getTippedMeColumns,
} from './columns';

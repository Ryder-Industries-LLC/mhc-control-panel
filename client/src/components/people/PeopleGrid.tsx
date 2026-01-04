import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BasePerson, PriorityLookup } from '../../types/people';
import { UserCard } from './UserCard';

export interface PeopleGridProps<T extends BasePerson> {
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptySubMessage?: string;
  gridCols?: string;
  getPriorityLookup?: (username: string) => PriorityLookup | null;
  onCardClick?: (person: T) => void;
  onTagClick?: (tag: string) => void;
  renderCard?: (person: T) => React.ReactNode;
  className?: string;
}

export function PeopleGrid<T extends BasePerson>({
  data,
  loading = false,
  emptyMessage = 'No users found.',
  emptySubMessage,
  gridCols = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  getPriorityLookup,
  onCardClick,
  onTagClick,
  renderCard,
  className = '',
}: PeopleGridProps<T>) {
  const navigate = useNavigate();

  const handleCardClick = (person: T) => {
    if (onCardClick) {
      onCardClick(person);
    } else {
      navigate(`/profile/${person.username}`);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-white/50 bg-white/5 border border-white/10 rounded-xl">
        Loading...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="p-12 text-center text-white/50 bg-white/5 border border-white/10 rounded-xl">
        <p>{emptyMessage}</p>
        {emptySubMessage && <p className="mt-2 text-sm">{emptySubMessage}</p>}
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols} gap-4 ${className}`}>
      {data.map((person) =>
        renderCard ? (
          <React.Fragment key={person.id}>{renderCard(person)}</React.Fragment>
        ) : (
          <UserCard
            key={person.id}
            person={person}
            priorityLookup={getPriorityLookup?.(person.username)}
            onClick={() => handleCardClick(person)}
            onTagClick={onTagClick}
          />
        )
      )}
    </div>
  );
}

export default PeopleGrid;

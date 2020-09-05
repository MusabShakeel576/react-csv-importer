import React, {
  useRef,
  useState,
  useMemo,
  useCallback,
  useLayoutEffect,
  useEffect
} from 'react';
import { createPortal } from 'react-dom';
import { useDrag } from 'react-use-gesture';
import { makeStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';
import Divider from '@material-ui/core/Divider';
import Paper from '@material-ui/core/Paper';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';

import { PreviewInfo, MAX_PREVIEW_ROWS } from './FormatPreview';

interface Field {
  label: string;
}

const fields: Field[] = [
  { label: 'Name' },
  { label: 'Email' },
  { label: 'DOB' },
  { label: 'Postal Code' },
  { label: 'Snack Preference' },
  { label: 'Country' },
  { label: 'Bees?' }
];

const SOURCES_PAGE_SIZE = 6;

const useStyles = makeStyles((theme) => ({
  mainHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: theme.spacing(2)
  },
  sourceArea: {
    display: 'flex',
    marginBottom: theme.spacing(2)
  },
  sourceAreaControl: {
    flex: 'none',
    display: 'flex',
    alignItems: 'center'
  },
  sourceAreaPage: {
    flex: '1 1 0',
    display: 'flex',
    paddingLeft: theme.spacing(1) // match interior box spacing
  },
  sourceAreaPageFiller: {
    flex: '1 1 0',
    marginRight: theme.spacing(1)
  },
  sourceBox: {
    flex: '1 1 0',
    marginRight: theme.spacing(1),
    width: 0 // prevent internal sizing from affecting placement
  },
  columnCardPaper: {
    position: 'relative', // for action
    padding: `${theme.spacing(1)}px ${theme.spacing(1.5)}px`,
    zIndex: 0, // reset stacking context
    cursor: 'default',

    '&[data-draggable=true]': {
      cursor: 'grab'
    },

    '&[data-dummy=true]': {
      userSelect: 'none'
    },

    '&[data-shadow=true]': {
      background: theme.palette.grey.A100,
      color: theme.palette.grey.A200 // reduce text
    },

    '&[data-drop-indicator=true]': {
      color: theme.palette.text.primary
    }
  },
  columnCardAction: {
    position: 'absolute',
    top: theme.spacing(0.5),
    right: theme.spacing(0.5),
    zIndex: 1 // right above card content
  },
  columnCardValue: {
    marginTop: theme.spacing(0.5),
    fontSize: '0.75em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',

    '& + div': {
      marginTop: 0
    }
  },
  targetArea: {
    display: 'flex',
    alignItems: 'flex-start',
    flexWrap: 'wrap'
  },
  targetBox: {
    flexShrink: 1,
    flexGrow: 0,
    flexBasis: '25%',
    width: 0, // avoid interference from internal width
    paddingRight: theme.spacing(2),
    paddingTop: theme.spacing(2)
  },
  targetBoxLabel: {
    marginBottom: theme.spacing(0.5),
    fontWeight: theme.typography.fontWeightBold,
    color: theme.palette.text.primary
  },
  targetBoxValue: {},
  targetBoxPlaceholderPaper: {
    padding: `${theme.spacing(1)}px ${theme.spacing(2)}px`,
    background: theme.palette.grey.A100
  },
  dragBox: {
    position: 'absolute', // @todo this is not working with scroll
    top: 0,
    left: 0,
    width: 0, // dynamically set at drag start
    height: 0,
    minWidth: 100, // in case could not compute
    pointerEvents: 'none'
  },
  dragBoxHolder: {
    position: 'absolute',
    width: '100%',
    left: '-50%',
    bottom: -4,
    opacity: 0.9
  }
}));

interface Column {
  index: number;
  values: string[];
}

const DUMMY_COLUMN = {
  index: -1,
  values: [...new Array(MAX_PREVIEW_ROWS)].map(() => '')
};

interface DragState {
  initialXY: number[];
  initialWidth: number;
  column: Column;
  dropFieldIndex: number | null;
}

// @todo sort out cases with fewer-than-max preview rows
// @todo sort out "grabbing" cursor state (does not work with pointer-events:none)
const ColumnCard: React.FC<{
  column: Column;
  action?: React.ReactElement;
  isShadow?: boolean;
  isDraggable?: boolean;
  isDropIndicator?: boolean;
}> = ({ column, action, isShadow, isDraggable, isDropIndicator }) => {
  const styles = useStyles();
  const isDummy = column.index === DUMMY_COLUMN.index;

  return (
    <Paper
      key={isDummy || isShadow ? 1 : isDropIndicator ? 2 : 0} // force re-creation to avoid transition anim
      className={styles.columnCardPaper}
      data-dummy={!!isDummy}
      data-shadow={!!isShadow}
      data-draggable={!!isDraggable}
      data-drop-indicator={!!isDropIndicator}
      elevation={isDummy || isShadow ? 0 : isDropIndicator ? 3 : undefined}
      variant={isDummy ? 'outlined' : 'elevation'}
      square={isDummy}
    >
      {isDummy ? '\u00a0' : `Col ${column.index}`}
      {action && <div className={styles.columnCardAction}>{action}</div>}

      <Divider />

      {column.values.map((value, valueIndex) => (
        <div key={valueIndex} className={styles.columnCardValue}>
          {value || '\u00a0'}
        </div>
      ))}
    </Paper>
  );
};

function useDragObject(
  dragState: DragState | null
): [React.ReactElement | null, (xy: number[]) => void] {
  const styles = useStyles();

  // @todo wrap in a no-events overlay to clip against screen edges
  const dragBoxRef = useRef<HTMLDivElement | null>(null);
  const dragObjectPortal = dragState
    ? createPortal(
        <div className={styles.dragBox} ref={dragBoxRef}>
          <div className={styles.dragBoxHolder}>
            <ColumnCard column={dragState.column} />
          </div>
        </div>,
        document.body
      )
    : null;

  // set up initial position
  const initialXY = dragState && dragState.initialXY;
  const initialWidth = dragState && dragState.initialWidth;
  useLayoutEffect(() => {
    if (!initialXY || initialWidth === null || !dragBoxRef.current) {
      return;
    }

    dragBoxRef.current.style.left = `${initialXY[0]}px`;
    dragBoxRef.current.style.top = `${initialXY[1]}px`;
    dragBoxRef.current.style.width = `${initialWidth}px`;
  }, [initialXY, initialWidth]);

  // live position updates without state changes
  const dragUpdateHandler = useCallback((xy: number[]) => {
    if (!dragBoxRef.current) {
      return;
    }

    dragBoxRef.current.style.left = `${xy[0]}px`;
    dragBoxRef.current.style.top = `${xy[1]}px`;
  }, []);

  return [dragObjectPortal, dragUpdateHandler];
}

const SourceBox: React.FC<{
  column: Column;
  fieldAssignments: (Column | null)[];
  dragState: DragState | null;
  eventBinder: (column: Column) => ReturnType<typeof useDrag>;
  onUnassign: (column: Column) => void;
}> = ({ column, fieldAssignments, dragState, eventBinder, onUnassign }) => {
  const styles = useStyles();

  const isShadow = dragState ? column === dragState.column : false;

  const isAssigned = useMemo(() => fieldAssignments.indexOf(column) !== -1, [
    fieldAssignments,
    column
  ]);

  const eventHandlers = useMemo(() => eventBinder(column), [
    eventBinder,
    column
  ]);

  return (
    <div className={styles.sourceBox} {...(isAssigned ? {} : eventHandlers)}>
      <ColumnCard
        column={column}
        isShadow={isShadow || isAssigned}
        isDraggable={!dragState && !isShadow && !isAssigned}
        action={
          isAssigned ? (
            <Button
              size="small"
              variant="contained"
              color="secondary"
              onClick={() => onUnassign(column)}
            >
              Unassign
            </Button>
          ) : undefined
        }
      />
    </div>
  );
};

// @todo current page indicator (dots)
const SourceArea: React.FC<{
  columns: Column[];
  fieldAssignments: (Column | null)[];
  dragState: DragState | null;
  eventBinder: (column: Column) => ReturnType<typeof useDrag>;
  onUnassign: (column: Column) => void;
}> = ({ columns, fieldAssignments, dragState, eventBinder, onUnassign }) => {
  const styles = useStyles();

  const [page, setPage] = useState<number>(0);
  const pageCount = Math.ceil(columns.length / SOURCES_PAGE_SIZE);

  const start = page * SOURCES_PAGE_SIZE;
  const pageContents = columns
    .slice(start, start + SOURCES_PAGE_SIZE)
    .map((column, columnIndex) => (
      <SourceBox
        key={columnIndex}
        column={column}
        fieldAssignments={fieldAssignments}
        dragState={dragState}
        eventBinder={eventBinder}
        onUnassign={onUnassign}
      />
    ));

  while (pageContents.length < SOURCES_PAGE_SIZE) {
    pageContents.push(
      <div key={pageContents.length} className={styles.sourceAreaPageFiller} />
    );
  }

  return (
    <div className={styles.sourceArea}>
      <div className={styles.sourceAreaControl}>
        <IconButton
          disabled={page === 0}
          onClick={() => {
            setPage((prev) => Math.max(0, prev - 1));
          }}
        >
          <ArrowBackIcon />
        </IconButton>
      </div>
      <div className={styles.sourceAreaPage}>{pageContents}</div>
      <div className={styles.sourceAreaControl}>
        <IconButton
          disabled={page === pageCount - 1}
          onClick={() => {
            setPage((prev) => Math.min(pageCount - 1, prev + 1));
          }}
        >
          <ArrowForwardIcon />
        </IconButton>
      </div>
    </div>
  );
};

const TargetBox: React.FC<{
  fieldIndex: number;
  field: Field;
  assignedColumn: Column | null;
  dragState: DragState | null;
  eventBinder: (
    column: Column,
    startFieldIndex?: number
  ) => ReturnType<typeof useDrag>;
  onHover: (fieldIndex: number, isOn: boolean) => void;
}> = ({
  fieldIndex,
  field,
  assignedColumn,
  dragState,
  eventBinder,
  onHover
}) => {
  const styles = useStyles();

  const mouseHoverHandlers = dragState
    ? {
        onMouseEnter: () => onHover(fieldIndex, true),
        onMouseLeave: () => onHover(fieldIndex, false)
      }
    : {};

  const sourceColumn =
    dragState && dragState.dropFieldIndex === fieldIndex
      ? dragState.column
      : null;

  // see if currently assigned column is being dragged again
  const isReDragged = dragState ? dragState.column === assignedColumn : false;

  const dragHandlers = useMemo(
    () =>
      assignedColumn && !isReDragged
        ? eventBinder(assignedColumn, fieldIndex)
        : {},
    [eventBinder, assignedColumn, isReDragged, fieldIndex]
  );

  const valueContents = useMemo(() => {
    if (sourceColumn) {
      return <ColumnCard column={sourceColumn} isDropIndicator />;
    }

    if (assignedColumn) {
      return (
        <ColumnCard
          column={assignedColumn}
          isShadow={isReDragged}
          isDraggable={!isReDragged}
        />
      );
    }

    return <ColumnCard column={DUMMY_COLUMN} />;
  }, [assignedColumn, sourceColumn, isReDragged]);

  // @todo mouse cursor changes to reflect draggable state
  return (
    <div className={styles.targetBox} {...mouseHoverHandlers}>
      <div className={styles.targetBoxLabel}>{field.label}</div>

      <div className={styles.targetBoxValue} {...dragHandlers}>
        {valueContents}
      </div>
    </div>
  );
};

export const ColumnPicker: React.FC<{ preview: PreviewInfo }> = ({
  preview
}) => {
  const styles = useStyles();

  const columns = useMemo<Column[]>(() => {
    return [...new Array(preview.firstRows[0].length)].map((empty, index) => {
      return {
        index,
        values: preview.firstRows.map((row) => row[index] || '')
      };
    });
  }, [preview]);

  const [fieldAssignments, setFieldAssignments] = useState<(Column | null)[]>(
    () => fields.map(() => null)
  );

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragObjectPortal, dragUpdateHandler] = useDragObject(dragState);

  const bindDrag = useDrag(({ first, last, event, xy, args }) => {
    if (first && event) {
      event.preventDefault();

      const [column, startFieldIndex] = args as [Column, number | undefined];

      setDragState({
        initialXY: xy,
        initialWidth:
          event.currentTarget instanceof HTMLElement
            ? event.currentTarget.offsetWidth
            : 0,
        column,
        dropFieldIndex: startFieldIndex !== undefined ? startFieldIndex : null
      });
    } else if (last) {
      setDragState(null);

      if (dragState) {
        const dropFieldIndex = dragState.dropFieldIndex;
        const droppedColumn = dragState.column;

        setFieldAssignments((prevAssignments) =>
          prevAssignments.map((prevCol, fieldIndex) => {
            // set new field column
            if (dropFieldIndex === fieldIndex) {
              return droppedColumn;
            }

            // otherwise, ensure dropped column does not show up elsewhere
            return prevCol === droppedColumn ? null : prevCol;
          })
        );
      }
    }

    dragUpdateHandler(xy);
  }, {});

  const dragHoverHandler = useCallback((fieldIndex: number, isOn: boolean) => {
    setDragState((prev): DragState | null => {
      if (!prev) {
        return prev;
      }

      if (isOn) {
        // set the new drop target
        return {
          ...prev,
          dropFieldIndex: fieldIndex
        };
      } else if (prev.dropFieldIndex === fieldIndex) {
        // clear drop target if we are still the current one
        return {
          ...prev,
          dropFieldIndex: null
        };
      }

      // no changes by default
      return prev;
    });
  }, []);

  const unassignHandler = useCallback((column: Column) => {
    setFieldAssignments((prev) =>
      prev.map((assignedColumn) =>
        assignedColumn === column ? null : assignedColumn
      )
    );
  }, []);

  return (
    <Card variant="outlined">
      <CardContent>
        <div className={styles.mainHeader}>
          {dragObjectPortal}

          <Typography variant="subtitle1" color="textPrimary" noWrap>
            Choose Columns
          </Typography>
        </div>

        <SourceArea
          columns={columns}
          fieldAssignments={fieldAssignments}
          dragState={dragState}
          eventBinder={bindDrag}
          onUnassign={unassignHandler}
        />

        <Divider />

        <div className={styles.targetArea}>
          {fields.map((field, fieldIndex) => (
            <TargetBox
              key={fieldIndex}
              fieldIndex={fieldIndex}
              field={field}
              assignedColumn={fieldAssignments[fieldIndex]}
              dragState={dragState}
              eventBinder={bindDrag}
              onHover={dragHoverHandler}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
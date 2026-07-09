import React, { useState, useEffect } from 'react';
import type {
  Measure,
  MeasureSubset,
  Hierarchy,
  TimeGranularities,
} from '../data/planConfigData';
import AccessControlModal from './AccessControlModal';
import '../styles/components/PlanningGridConfig.css';

const imgCloseIcon = "data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M18 6L6 18M6 6l12 12' stroke='%23666' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";
const imgDragHandleIcon = "data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='3.5' r='1' fill='%23747474'/%3E%3Ccircle cx='4' cy='7' r='1' fill='%23747474'/%3E%3Ccircle cx='4' cy='10.5' r='1' fill='%23747474'/%3E%3Ccircle cx='9.5' cy='3.5' r='1' fill='%23747474'/%3E%3Ccircle cx='9.5' cy='7' r='1' fill='%23747474'/%3E%3Ccircle cx='9.5' cy='10.5' r='1' fill='%23747474'/%3E%3C/svg%3E";
const imgRemoveIcon = "data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10.5 3.5L3.5 10.5M3.5 3.5l7 7' stroke='%235C5C5C' stroke-width='1.7' stroke-linecap='round'/%3E%3C/svg%3E";
const imgMeasuresEmptyState = "data:image/svg+xml,%3Csvg width='126' height='115' viewBox='0 0 126 115' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 84V29c0-8.8 7.2-16 16-16h25l11 11h46c6.6 0 12 5.4 12 12v48c0 6.6-5.4 12-12 12H26c-6.6 0-12-5.4-12-12z' fill='%23EAF2FF'/%3E%3Ccircle cx='47' cy='39' r='14' fill='%235A8CFF'/%3E%3Cpath d='M66 70l25-25 8 8-25 25-8 3 3-11z' fill='%2396B8FF'/%3E%3Cpath d='M91 45l5-5 8 8-5 5-8-8z' fill='%23BCD2FF'/%3E%3Cpath d='M1 58h12M113 17h12M102 113V87M91 113l11-26M113 113l-11-26' stroke='%230176D3' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";
const BASE_URL = import.meta.env.BASE_URL;
const imgTimeGridPreview = `${BASE_URL}time-grid-preview.png`;
const imgAccountGridPreview = `${BASE_URL}account-grid-preview.png`;
const imgProductGridPreview = `${BASE_URL}product-grid-preview.png`;
const imgMeasuresGridPreview = `${BASE_URL}measures-grid-preview.png`;
const imgSearchSmall = "data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='6' cy='6' r='4.2' stroke='%239E9E9E' stroke-width='1.2'/%3E%3Cpath d='M9.2 9.2L12 12' stroke='%239E9E9E' stroke-width='1.2' stroke-linecap='round'/%3E%3C/svg%3E";
const imgDropdownSmall = "data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='%23747474' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";
const imgEditIconSmall = "data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2.4 11.6l2.1-.4 5.2-5.2-1.7-1.7-5.2 5.2-.4 2.1z' stroke='%23666' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M7.1 3.6l1.7 1.7' stroke='%23666' stroke-width='1.2' stroke-linecap='round'/%3E%3C/svg%3E";
const imgDeleteIconSmall = "data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10.5 3.5L3.5 10.5M3.5 3.5l7 7' stroke='%23666' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E";

interface SavedConfigInfo {
  name: string;
  description: string;
}

interface NewMeasureForm {
  measureName: string;
  description: string;
  measureCode: string;
  valueType: string;
  roundingPrecision: string;
  writebackEnabled: boolean;
  calculatedExpression: string;
  aggregationRule: string;
}

interface LocalSubset {
  id: string | number;
  name: string;
}

interface MeasureTypeOption {
  id: string;
  icon: string;
  title: string;
}

interface DimensionContent {
  panel2Title: string;
  panel2Description: string;
  levels: string[];
  previewTitle: string;
  previewDescription: string;
}

export interface PlanningGridConfigProps {
  title?: string;
  onClose?: () => void;
  onBack?: (savedConfig?: SavedConfigInfo) => void;
  hierarchies: Hierarchy[];
  measures: Measure[];
  setMeasures: React.Dispatch<React.SetStateAction<Measure[]>>;
  measureSubsets?: MeasureSubset[];
  setMeasureSubsets?: React.Dispatch<React.SetStateAction<MeasureSubset[]>>;
  timeGranularities: TimeGranularities;
}

export default function PlanningGridConfig({
  title,
  onBack,
  hierarchies: propHierarchies,
  measures: propMeasures,
  setMeasures: propSetMeasures,
  measureSubsets: propMeasureSubsets,
  setMeasureSubsets: propSetMeasureSubsets,
  timeGranularities,
}: PlanningGridConfigProps) {
  const [selectedComponentTab, setSelectedComponentTab] = useState<'Dimensions' | 'Measures'>('Dimensions');
  const [hasSavedOnce, setHasSavedOnce] = useState(false);
  const [isAssignToModalOpen, setIsAssignToModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [configName, setConfigName] = useState('');
  const [configDescription, setConfigDescription] = useState('');
  const [isAddMeasuresModalOpen, setIsAddMeasuresModalOpen] = useState(false);

  // Get available subsets from props, initialize with default if empty
  const availableSubsets = propMeasureSubsets || [];

  const [measureSubsets, setMeasureSubsets] = useState<LocalSubset[]>([{ id: 'default-subset', name: 'Default Subset' }]);
  const [selectedSubsetId, setSelectedSubsetId] = useState<string | number>('default-subset');
  const [measureTableKey, setMeasureTableKey] = useState(0);
  const [subsetNameInput, setSubsetNameInput] = useState('');
  const [showSubsetDropdown, setShowSubsetDropdown] = useState(false);
  const [editingSubsetId, setEditingSubsetId] = useState<string | number | null>(null);
  const [editingSubsetName, setEditingSubsetName] = useState('');
  const [selectedMeasuresBySubset, setSelectedMeasuresBySubset] = useState<Record<string, number[]>>({ 'default-subset': [] });
  const [measureSearchTerm, setMeasureSearchTerm] = useState('');
  const [measureTypeFilter, setMeasureTypeFilter] = useState('All Types');
  const [measureAggregationFilter, setMeasureAggregationFilter] = useState('All Aggregations');
  const [measureDisaggregationFilter, setMeasureDisaggregationFilter] = useState('All Disaggregations');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [showCreateMeasureTypeView, setShowCreateMeasureTypeView] = useState(false);
  const [selectedCreateMeasureType, setSelectedCreateMeasureType] = useState<string | null>(null);
  const [selectedSubsetsForNewMeasure, setSelectedSubsetsForNewMeasure] = useState<Array<string | number>>(['default-subset']);
  const [showCreateSubsetDropdown, setShowCreateSubsetDropdown] = useState(false);
  const [measureTypeSearchTerm, setMeasureTypeSearchTerm] = useState('');
  const [showMeasureTypeOptions, setShowMeasureTypeOptions] = useState(false);
  const [newMeasureFormValues, setNewMeasureFormValues] = useState<NewMeasureForm>({
    measureName: '',
    description: '',
    measureCode: '',
    valueType: '',
    roundingPrecision: '2',
    writebackEnabled: false,
    calculatedExpression: '',
    aggregationRule: 'Sum',
  });
  const [selectedRowDimension, setSelectedRowDimension] = useState('Time');
  const [selectedRowDimensions, setSelectedRowDimensions] = useState<string[]>([]);
  const [dimensionToAdd, setDimensionToAdd] = useState('');
  const [draggedDimension, setDraggedDimension] = useState<string | null>(null);
  const [draggedSubsetId, setDraggedSubsetId] = useState<string | number | null>(null);
  const [draggedMeasureId, setDraggedMeasureId] = useState<number | null>(null);
  const [gridPreviewOpen, setGridPreviewOpen] = useState(true);
  const [enableFiltering, setEnableFiltering] = useState(false);
  const [selectedHierarchyId, setSelectedHierarchyId] = useState<string | null>(null);

  // Use hierarchies from props
  const hierarchiesData = propHierarchies || [];

  // Use measures from props
  const measuresData = propMeasures || [];
  const setMeasuresData = propSetMeasures || (() => {
    console.warn('setMeasuresData function not provided');
  });

  const availableDimensions = ['Account', 'Product'];
  const availableMeasureTypes: MeasureTypeOption[] = [
    { id: 'Read only', icon: '🧾', title: 'Read only' },
    { id: 'Editable', icon: '✎', title: 'Editable' },
    { id: 'Calculated', icon: '+', title: 'Calculated' },
  ];
  // Map time granularities to level names
  const getFilteredTimeLevels = (): string[] => {
    const allLevels = [
      { granularity: 'Yearly', level: 'Year' },
      { granularity: 'Quarterly', level: 'Quarter' },
      { granularity: 'Monthly', level: 'Month' },
      { granularity: 'Weekly', level: 'Week' },
    ];

    return allLevels
      .filter((item) => timeGranularities && timeGranularities[item.granularity as keyof TimeGranularities])
      .map((item) => item.level);
  };

  const dimensionContentMap: Record<string, DimensionContent> = {
    Account: {
      panel2Title: 'Account Hierarchy',
      panel2Description: 'Choose which levels of the hierarchy to display in the grid',
      levels: ['Level 0 - HQ', 'Level 1 - Regional', 'Level 2 - Country'],
      previewTitle: 'Grid preview',
      previewDescription: 'Preview for account hierarchy rows and selected measures.',
    },
    Product: {
      panel2Title: 'Product Hierarchy',
      panel2Description: 'Choose which product levels should appear in the planning grid',
      levels: ['Level 0 - Category', 'Level 1 - Family', 'Level 2 - SKU'],
      previewTitle: 'Grid preview',
      previewDescription: 'Preview for product hierarchy rows and selected measures.',
    },
    Time: {
      panel2Title: 'Time Dimension',
      panel2Description: 'Choose the time buckets and granularity used in the planning grid',
      levels: getFilteredTimeLevels(),
      previewTitle: 'Grid preview',
      previewDescription: 'Preview for time-based rows and selected measures.',
    },
  };

  const activeDimension = selectedRowDimension || 'Account';
  const activeDimensionContent = dimensionContentMap[activeDimension] || dimensionContentMap.Account;

  // Filter hierarchies based on active dimension
  const availableHierarchies = hierarchiesData.filter((h) => h.dimension === activeDimension);

  // Get selected hierarchy or default to first available
  const selectedHierarchy = selectedHierarchyId
    ? hierarchiesData.find((h) => h.id === selectedHierarchyId)
    : availableHierarchies[0];

  // Auto-select first hierarchy when dimension changes
  useEffect(() => {
    if (availableHierarchies.length > 0) {
      const currentSelectedIsValid = availableHierarchies.find((h) => h.id === selectedHierarchyId);
      if (!currentSelectedIsValid) {
        setSelectedHierarchyId(availableHierarchies[0].id);
      }
    }
  }, [activeDimension, availableHierarchies, selectedHierarchyId]);

  const handleRemoveDimension = (dimensionToRemove: string) => {
    setSelectedRowDimensions((prev) => {
      const next = prev.filter((dimension) => dimension !== dimensionToRemove);
      if (selectedRowDimension === dimensionToRemove) {
        setSelectedRowDimension(next.length > 0 ? next[0] : 'Time');
      }
      return next;
    });
  };

  const handleDimensionDragStart = (dimension: string) => {
    setDraggedDimension(dimension);
  };

  const handleDimensionDrop = (targetDimension: string) => {
    if (!draggedDimension || draggedDimension === targetDimension) {
      return;
    }

    setSelectedRowDimensions((prev) => {
      const next = [...prev];
      const fromIndex = next.indexOf(draggedDimension);
      const toIndex = next.indexOf(targetDimension);
      if (fromIndex === -1 || toIndex === -1) {
        return prev;
      }
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggedDimension);
      return next;
    });
    setDraggedDimension(null);
  };

  const handleAddDimension = (dimension: string) => {
    if (!dimension) {
      return;
    }
    setSelectedRowDimensions((prev) => {
      if (prev.includes(dimension)) {
        return prev;
      }
      return [...prev, dimension];
    });
    setSelectedRowDimension(dimension);
    setDimensionToAdd('');
  };

  const handleSave = () => {
    setIsSaveModalOpen(true);
  };

  const handleConfirmSave = () => {
    setHasSavedOnce(true);
    setIsSaveModalOpen(false);
    if (onBack) {
      onBack({
        name: configName,
        description: configDescription,
      });
    }
  };

  const handleCancelSave = () => {
    setIsSaveModalOpen(false);
    setConfigName('');
    setConfigDescription('');
  };

  const handleCancel = () => {
    if (onBack) {
      onBack();
    }
  };

  const handleCreateSubset = () => {
    const subsetName = subsetNameInput.trim();
    if (!subsetName) {
      return;
    }

    // Check if this subset already exists in available subsets (exact match)
    const exactMatch = availableSubsets.find((s) => s.name.toLowerCase() === subsetName.toLowerCase());

    if (exactMatch) {
      // Use existing subset - check if already added to measureSubsets
      const alreadyAdded = measureSubsets.find((s) => s.id === exactMatch.id);
      if (!alreadyAdded) {
        setMeasureSubsets((prev) => [...prev, { id: exactMatch.id, name: exactMatch.name }]);
        // Convert measure names from global state to measure IDs for local state
        const measureIds = (exactMatch.measures || [])
          .map((measureName) => {
            const measure = measuresData.find((m) => m.name === measureName);
            return measure ? measure.id : null;
          })
          .filter((id): id is number => id !== null);
        setSelectedMeasuresBySubset((prev) => ({ ...prev, [exactMatch.id]: measureIds }));
        setSelectedSubsetId(exactMatch.id);
      } else {
        // Just select it
        setSelectedSubsetId(exactMatch.id);
      }
    } else {
      // Create new subset
      const subsetId = `subset-${Date.now()}`;
      const newSubset: MeasureSubset = {
        id: subsetId,
        name: subsetName,
        description: '',
        measureCount: 0,
        selected: false,
        lastModified: 'Just now',
        measures: [],
      };

      // Add to global measureSubsets
      if (propSetMeasureSubsets) {
        propSetMeasureSubsets((prev) => [newSubset, ...prev]);
      }

      // Add to local measureSubsets
      setMeasureSubsets((prev) => [...prev, { id: subsetId, name: subsetName }]);
      setSelectedMeasuresBySubset((prev) => ({ ...prev, [subsetId]: [] }));
      setSelectedSubsetId(subsetId);
    }

    setSubsetNameInput('');
    setShowSubsetDropdown(false);
  };

  const handleSelectExistingSubset = (subset: MeasureSubset) => {
    // Check if already added to measureSubsets
    const alreadyAdded = measureSubsets.find((s) => s.id === subset.id);
    if (!alreadyAdded) {
      setMeasureSubsets((prev) => [...prev, { id: subset.id, name: subset.name }]);
      // Convert measure names from global state to measure IDs for local state
      const measureIds = (subset.measures || [])
        .map((measureName) => {
          const measure = measuresData.find((m) => m.name === measureName);
          return measure ? measure.id : null;
        })
        .filter((id): id is number => id !== null);
      setSelectedMeasuresBySubset((prev) => ({ ...prev, [subset.id]: measureIds }));
    }
    setSelectedSubsetId(subset.id);
    setSubsetNameInput('');
    setShowSubsetDropdown(false);
  };

  // Filter available subsets based on input
  const filteredAvailableSubsets = availableSubsets.filter((subset) =>
    subset.name.toLowerCase().includes(subsetNameInput.toLowerCase())
  );

  // Check if there's an exact match
  const hasExactMatch = availableSubsets.some((s) =>
    s.name.toLowerCase() === subsetNameInput.trim().toLowerCase()
  );

  // Enable + button only when there's input and no exact match (for creating new)
  const canCreateNew = subsetNameInput.trim() && !hasExactMatch;

  const handleStartSubsetRename = (subsetId: string | number, subsetName: string) => {
    setEditingSubsetId(subsetId);
    setEditingSubsetName(subsetName);
  };

  const handleCommitSubsetRename = () => {
    const nextName = editingSubsetName.trim();
    if (!editingSubsetId || !nextName) {
      setEditingSubsetId(null);
      return;
    }
    setMeasureSubsets((prev) =>
      prev.map((subset) =>
        subset.id === editingSubsetId ? { ...subset, name: nextName } : subset
      )
    );
    setEditingSubsetId(null);
    setEditingSubsetName('');
  };

  const handleDeleteSubset = (subsetId: string | number) => {
    if (subsetId === 'default-subset') return;
    setMeasureSubsets((prev) => prev.filter((subset) => subset.id !== subsetId));
    setSelectedMeasuresBySubset((prev) => {
      const next = { ...prev };
      delete next[subsetId];
      return next;
    });
    if (selectedSubsetId === subsetId) {
      setSelectedSubsetId('default-subset');
    }
    setShowCreateMeasureTypeView(false);
  };

  const toggleMeasureSelection = (measureId: number) => {
    if (!selectedSubsetId) {
      return;
    }

    setSelectedMeasuresBySubset((prev) => {
      const selectedForSubset = prev[selectedSubsetId] || [];
      const nextSelected = selectedForSubset.includes(measureId)
        ? selectedForSubset.filter((id) => id !== measureId)
        : [...selectedForSubset, measureId];
      return { ...prev, [selectedSubsetId]: nextSelected };
    });
  };

  const toggleAllFilteredMeasureSelections = () => {
    if (!selectedSubsetId) {
      return;
    }

    setSelectedMeasuresBySubset((prev) => {
      const selectedForSubset = prev[selectedSubsetId] || [];
      const filteredMeasureIds = filteredMeasures.map((measure) => measure.id);
      const allFilteredSelected =
        filteredMeasureIds.length > 0 &&
        filteredMeasureIds.every((measureId) => selectedForSubset.includes(measureId));

      const nextSelected = allFilteredSelected
        ? selectedForSubset.filter((measureId) => !filteredMeasureIds.includes(measureId))
        : [...new Set([...selectedForSubset, ...filteredMeasureIds])];

      return { ...prev, [selectedSubsetId]: nextSelected };
    });
  };

  const selectedMeasureIdsForSubset = selectedMeasuresBySubset[selectedSubsetId] || [];
  const selectedMeasuresForSubset = selectedMeasureIdsForSubset
    .map((measureId) => measuresData.find((measure) => measure.id === measureId))
    .filter((measure): measure is Measure => Boolean(measure));
  const measureTypeOptions = ['All Types', ...new Set(measuresData.map((measure) => measure.type))];
  const measureAggregationOptions = ['All Aggregations', ...new Set(measuresData.map((measure) => measure.aggregation))];
  const measureDisaggregationOptions = ['All Disaggregations', ...new Set(measuresData.map((measure) => measure.disaggregation))];
  const measureCategoryOptions = ['All Categories', ...new Set(measuresData.map((measure) => measure.category))];
  const filteredMeasures = measuresData.filter((measure) => {
    const normalizedSearch = measureSearchTerm.trim().toLowerCase();
    const matchesSearch =
      !normalizedSearch ||
      measure.name.toLowerCase().includes(normalizedSearch) ||
      measure.description.toLowerCase().includes(normalizedSearch);
    const matchesType = measureTypeFilter === 'All Types' || measure.type === measureTypeFilter;
    const matchesAggregation = measureAggregationFilter === 'All Aggregations' || measure.aggregation === measureAggregationFilter;
    const matchesDisaggregation =
      measureDisaggregationFilter === 'All Disaggregations' || measure.disaggregation === measureDisaggregationFilter;
    const matchesSelection = !showSelectedOnly || selectedMeasureIdsForSubset.includes(measure.id);

    return matchesSearch && matchesType && matchesAggregation && matchesDisaggregation && matchesSelection;
  });
  const hasFilteredMeasures = filteredMeasures.length > 0;
  const areAllFilteredMeasuresSelected =
    hasFilteredMeasures &&
    filteredMeasures.every((measure) => selectedMeasureIdsForSubset.includes(measure.id));
  const shouldUseMeasureTypeCombobox = availableMeasureTypes.length >= 8;
  const filteredMeasureTypeOptions = availableMeasureTypes.filter((typeOption) =>
    typeOption.title.toLowerCase().includes(measureTypeSearchTerm.trim().toLowerCase())
  );
  const canCreateMeasure = Boolean(
    selectedCreateMeasureType &&
      newMeasureFormValues.measureName.trim() &&
      newMeasureFormValues.measureCode.trim() &&
      selectedSubsetsForNewMeasure.length > 0
  );
  const getCategoryClassName = (category: string) => {
    const normalizedCategory = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `measure-category-badge measure-category-${normalizedCategory}`;
  };
  const selectedSubset = measureSubsets.find((subset) => subset.id === selectedSubsetId);
  const visibleSubsetsOnConfigPage = measureSubsets.filter((subset) => {
    if (subset.id !== 'default-subset') {
      return true;
    }
    return (selectedMeasuresBySubset[subset.id] || []).length > 0;
  });

  const handleSubsetDrop = (targetSubsetId: string | number) => {
    if (!draggedSubsetId || draggedSubsetId === targetSubsetId) return;
    setMeasureSubsets((prev) => {
      const next = [...prev];
      const fromIndex = next.findIndex((subset) => subset.id === draggedSubsetId);
      const toIndex = next.findIndex((subset) => subset.id === targetSubsetId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [movedSubset] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedSubset);
      return next;
    });
    setDraggedSubsetId(null);
  };

  const handleSelectSubset = (subsetId: string | number) => {
    setSelectedSubsetId(subsetId);
    setShowCreateMeasureTypeView(false);
  };

  const handleOpenCreateMeasureTypeView = () => {
    setShowCreateMeasureTypeView(true);
    setSelectedCreateMeasureType(null);
    setSelectedSubsetsForNewMeasure([selectedSubsetId]);
    setMeasureTypeSearchTerm('');
    setShowMeasureTypeOptions(false);
    setShowCreateSubsetDropdown(false);
  };

  const toggleCreateSubsetSelection = (subsetId: string | number) => {
    setSelectedSubsetsForNewMeasure((prev) => {
      if (prev.includes(subsetId)) {
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter((id) => id !== subsetId);
      }
      return [...prev, subsetId];
    });
  };

  const handleNewMeasureFormChange = (key: keyof NewMeasureForm, value: string | boolean) => {
    setNewMeasureFormValues((prev) => ({ ...prev, [key]: value } as NewMeasureForm));
  };

  const handleCreateMeasure = () => {
    if (!canCreateMeasure) {
      return;
    }
    const nextMeasureId = Date.now();
    const createdMeasure: Measure = {
      id: nextMeasureId,
      name: newMeasureFormValues.measureName.trim(),
      description: newMeasureFormValues.description.trim() || newMeasureFormValues.measureName.trim(),
      type: selectedCreateMeasureType || 'Read',
      sourceDmo: newMeasureFormValues.measureCode.trim(),
      code: newMeasureFormValues.measureCode.trim(),
      aggregation: newMeasureFormValues.aggregationRule || 'SUM',
      disaggregation: newMeasureFormValues.writebackEnabled ? 'Editable' : 'Proportional',
      category: 'Custom',
    };

    // Update measures data - add to beginning of array
    setMeasuresData((prev) => [createdMeasure, ...prev]);

    // Add to selected subsets
    setSelectedMeasuresBySubset((prev) => {
      const next = { ...prev };
      selectedSubsetsForNewMeasure.forEach((subsetId) => {
        const current = next[subsetId] || [];
        next[subsetId] = [nextMeasureId, ...current];
      });
      return next;
    });

    // Reset all filters to show all measures
    setMeasureSearchTerm('');
    setMeasureTypeFilter('All Types');
    setMeasureAggregationFilter('All Aggregations');
    setMeasureDisaggregationFilter('All Disaggregations');
    setShowSelectedOnly(false);

    // Force table re-render
    setMeasureTableKey((prev) => prev + 1);

    // Close the create view
    setShowCreateMeasureTypeView(false);

    // Reset create form state
    setSelectedCreateMeasureType(null);
    setSelectedSubsetsForNewMeasure([selectedSubsetId]);
    setMeasureTypeSearchTerm('');
    setShowMeasureTypeOptions(false);
    setShowCreateSubsetDropdown(false);

    // Reset form values
    setNewMeasureFormValues({
      measureName: '',
      description: '',
      measureCode: '',
      valueType: '',
      roundingPrecision: '2',
      writebackEnabled: false,
      calculatedExpression: '',
      aggregationRule: 'Sum',
    });
  };

  const closeAddMeasuresModal = () => {
    // Sync local measure selections back to global state
    if (propSetMeasureSubsets) {
      propSetMeasureSubsets((prevSubsets) =>
        prevSubsets.map((subset) => {
          // Check if this subset is in the local measureSubsets
          const localSubset = measureSubsets.find((s) => s.id === subset.id);
          if (localSubset && selectedMeasuresBySubset[subset.id]) {
            // Convert measure IDs back to measure names
            const measureNames = selectedMeasuresBySubset[subset.id]
              .map((measureId) => {
                const measure = measuresData.find((m) => m.id === measureId);
                return measure ? measure.name : null;
              })
              .filter((name): name is string => name !== null);

            // Update the subset with new measures and measureCount
            return {
              ...subset,
              measures: measureNames,
              measureCount: measureNames.length,
              lastModified: 'Just now',
            };
          }
          return subset;
        })
      );
    }

    setIsAddMeasuresModalOpen(false);
    setShowCreateMeasureTypeView(false);
  };

  const handleMeasureDrop = (targetMeasureId: number) => {
    if (!draggedMeasureId || draggedMeasureId === targetMeasureId || !selectedSubsetId) return;
    setSelectedMeasuresBySubset((prev) => {
      const current = prev[selectedSubsetId] || [];
      const fromIndex = current.indexOf(draggedMeasureId);
      const toIndex = current.indexOf(targetMeasureId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...current];
      const [movedMeasure] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedMeasure);
      return { ...prev, [selectedSubsetId]: next };
    });
    setDraggedMeasureId(null);
  };

  const handleRemoveMeasureFromSubset = (measureId: number) => {
    if (!selectedSubsetId) return;
    setSelectedMeasuresBySubset((prev) => {
      const current = prev[selectedSubsetId] || [];
      return {
        ...prev,
        [selectedSubsetId]: current.filter((id) => id !== measureId),
      };
    });
  };

  return (
    <div className="planning-grid-config">
      {/* Page Header */}
      <div className="planning-grid-header">
        <h1 className="planning-grid-title">{title || 'KAMPlanConfig'}</h1>
        <div className="planning-grid-header-actions">
          <button
            className={`planning-grid-button ${hasSavedOnce ? 'planning-grid-button-neutral' : 'planning-grid-button-disabled'}`}
            disabled={!hasSavedOnce}
            onClick={() => setIsAssignToModalOpen(true)}
            type="button"
          >
            Assign To
          </button>
          <button
            className="planning-grid-button planning-grid-button-neutral"
            onClick={handleCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="planning-grid-button planning-grid-button-brand"
            onClick={handleSave}
            type="button"
          >
            Save
          </button>
        </div>
      </div>

      <div className="planning-grid-content-wrapper">
        {/* Left Panel - Components */}
        <div className="planning-grid-left-panel">
          <div className="planning-grid-panel">
            <div className="planning-grid-panel-header">
              <h3 className="planning-grid-panel-title">Components</h3>
            </div>

            {/* Tabs */}
            <div className="planning-grid-tabs">
              <button
                className={`planning-grid-tab ${selectedComponentTab === 'Dimensions' ? 'active' : ''}`}
                onClick={() => setSelectedComponentTab('Dimensions')}
              >
                Dimensions
              </button>
              <button
                className={`planning-grid-tab ${selectedComponentTab === 'Measures' ? 'active' : ''}`}
                onClick={() => setSelectedComponentTab('Measures')}
              >
                Measures
              </button>
            </div>

            {selectedComponentTab === 'Dimensions' ? (
              <div className="planning-grid-components-content">
                <select
                  className="planning-grid-dimension-select"
                  value={dimensionToAdd}
                  onChange={(e) => handleAddDimension(e.target.value)}
                >
                  <option value="" disabled>Select Dimensions</option>
                  {availableDimensions
                    .filter((dimension) => !selectedRowDimensions.includes(dimension))
                    .map((dimension) => (
                      <option key={dimension} value={dimension}>
                        {dimension}
                      </option>
                    ))}
                </select>

                <div className="planning-grid-section">
                  <h4 className="planning-grid-section-title">Column Dimension (Default)</h4>
                </div>
                <button
                  className={`planning-grid-default-dimension ${selectedRowDimension === 'Time' ? 'active' : ''}`}
                  onClick={() => setSelectedRowDimension('Time')}
                  type="button"
                >
                  Time
                </button>

                <div className="planning-grid-section">
                  <h4 className="planning-grid-section-title">Row Dimensions</h4>
                </div>

                {selectedRowDimensions.map((dimension) => (
                  <div
                    key={dimension}
                    className={`planning-grid-selected-dimension-item ${selectedRowDimension === dimension ? 'active' : ''}`}
                    onClick={() => setSelectedRowDimension(dimension)}
                    draggable
                    onDragStart={() => handleDimensionDragStart(dimension)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDimensionDrop(dimension)}
                    onDragEnd={() => setDraggedDimension(null)}
                  >
                    <div className="planning-grid-selected-dimension-left">
                      <span className="planning-grid-drag-handle" aria-hidden="true">
                        <img src={imgDragHandleIcon} alt="" />
                      </span>
                      <span>{dimension}</span>
                    </div>
                    <button
                      className="planning-grid-selected-dimension-remove"
                      aria-label={`Remove ${dimension} dimension`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveDimension(dimension);
                      }}
                    >
                      <img src={imgRemoveIcon} alt="" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="planning-grid-components-content">
                <div className="planning-grid-section">
                  <h4 className="planning-grid-section-title">Selected Subsets</h4>
                  <p className="planning-grid-section-description planning-grid-subset-helper-text">
                    Measures can be grouped into subsets. Use Manage Measures to add measures and organize subsets.
                  </p>
                </div>

                {visibleSubsetsOnConfigPage.map((subset) => (
                  <div
                    key={subset.id}
                    className={`planning-grid-selected-dimension-item planning-grid-subset-row-item ${selectedSubsetId === subset.id ? 'active' : ''}`}
                    onClick={() => setSelectedSubsetId(subset.id)}
                    draggable
                    onDragStart={() => setDraggedSubsetId(subset.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleSubsetDrop(subset.id)}
                    onDragEnd={() => setDraggedSubsetId(null)}
                  >
                    <div className="planning-grid-selected-dimension-left">
                      <span className="planning-grid-drag-handle" aria-hidden="true">
                        <img src={imgDragHandleIcon} alt="" />
                      </span>
                      <span>
                        {subset.name} ({(selectedMeasuresBySubset[subset.id] || []).length})
                      </span>
                    </div>
                    <div className="planning-grid-subset-row-actions">
                      {subset.id !== 'default-subset' && (
                        <button
                          type="button"
                          className="planning-grid-selected-dimension-remove"
                          aria-label={`Remove ${subset.name} subset`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSubset(subset.id);
                          }}
                        >
                          <img src={imgRemoveIcon} alt="" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button className="planning-grid-empty-state-button" onClick={() => setIsAddMeasuresModalOpen(true)}>
                  Manage Measures
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Middle Panel - Dimension Details */}
        <div className="planning-grid-middle-panel">
          <div className="planning-grid-panel">
            <div className="planning-grid-panel-header">
              <h3 className="planning-grid-panel-title">Properties</h3>
            </div>
            {selectedComponentTab === 'Measures' ? (
              selectedMeasuresForSubset.length ? (
                <div className="planning-grid-components-content">
                  <div className="planning-grid-highlight-box planning-grid-highlight-box-compact">
                    <div className="planning-grid-highlight-label">Selected Subset</div>
                    <div className="planning-grid-highlight-value">
                      {selectedSubset?.name || 'Default Subset'}
                    </div>
                  </div>
                  {selectedMeasuresForSubset.map((measure) => (
                    <div
                      key={measure.id}
                      className="planning-grid-selected-dimension-item planning-grid-measure-row-item"
                      draggable
                      onDragStart={() => setDraggedMeasureId(measure.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleMeasureDrop(measure.id)}
                      onDragEnd={() => setDraggedMeasureId(null)}
                    >
                      <div className="planning-grid-selected-dimension-left">
                        <span className="planning-grid-drag-handle" aria-hidden="true">
                          <img src={imgDragHandleIcon} alt="" />
                        </span>
                        <span>{measure.name}</span>
                      </div>
                      <button
                        type="button"
                        className="planning-grid-selected-dimension-remove"
                        aria-label={`Remove ${measure.name} measure`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveMeasureFromSubset(measure.id);
                        }}
                      >
                        <img src={imgRemoveIcon} alt="" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="planning-grid-empty-state planning-grid-empty-state-secondary">
                  <img src={imgMeasuresEmptyState} alt="" className="planning-grid-empty-state-image" />
                  <h4 className="planning-grid-empty-state-title">No measures yet</h4>
                  <p className="planning-grid-empty-state-description">
                    Add measures to Default Subset, or create subsets to group them on the grid.
                  </p>
                  <button
                    type="button"
                    className="planning-grid-inline-link-button"
                    onClick={() => setIsAddMeasuresModalOpen(true)}
                  >
                    Open Manage Measures
                  </button>
                </div>
              )
            ) : (
              <>
                <div className="planning-grid-highlight-box">
                  <div className="planning-grid-highlight-label">Selected Dimension</div>
                  <div className="planning-grid-highlight-value">{activeDimensionContent.panel2Title}</div>
                </div>

                {/* Hierarchy Selection Dropdown - only for Account and Product dimensions */}
                {activeDimension !== 'Time' && (
                  <div className="planning-grid-section" style={{ marginTop: '16px' }}>
                    <label className="planning-grid-hierarchy-label">
                      Select Hierarchy
                    </label>
                    <select
                      className="planning-grid-hierarchy-select"
                      value={selectedHierarchy?.id || ''}
                      onChange={(e) => {
                        setSelectedHierarchyId(e.target.value);
                      }}
                    >
                      {availableHierarchies.map((hierarchy) => (
                        <option key={hierarchy.id} value={hierarchy.id}>
                          {hierarchy.name} ({hierarchy.numLevels} Levels)
                        </option>
                      ))}
                    </select>
                    {selectedHierarchy && (
                      <p className="planning-grid-hierarchy-levels-count">
                        {selectedHierarchy.numLevels} Levels
                      </p>
                    )}
                  </div>
                )}

                <div className="planning-grid-section" style={{ marginTop: activeDimension === 'Time' ? '16px' : '0' }}>
                  <h4 className="planning-grid-section-title">Hierarchy Levels</h4>
                  <p className="planning-grid-section-description">
                    {activeDimensionContent.panel2Description}
                  </p>
                </div>

                {/* Checkboxes for hierarchy levels */}
                <div className="planning-grid-checkbox-group">
                  {activeDimension === 'Time' ? (
                    activeDimensionContent.levels.map((level, index) => {
                      return (
                        <label className="planning-grid-checkbox-item" key={level}>
                          <input type="checkbox" defaultChecked={index < 4} />
                          <span>{level}</span>
                        </label>
                      );
                    })
                  ) : (
                    selectedHierarchy?.levels.map((level, index) => {
                      return (
                        <label className="planning-grid-checkbox-item" key={level.id}>
                          <input type="checkbox" defaultChecked={index < 4} />
                          <span>Level {level.id} - {level.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </>
            )}

          </div>

          {/* Enable Filtering Section */}
          {selectedComponentTab !== 'Measures' && (
            <div className="planning-grid-filter-section">
              <div className="planning-grid-filter-text">
                <span className="planning-grid-filter-label">Enable Filtering</span>
                <p className="planning-grid-filter-description">
                  Allow users to filter data within this planning grid
                </p>
              </div>
              <label className="planning-grid-toggle">
                <input
                  type="checkbox"
                  checked={enableFiltering}
                  onChange={(e) => setEnableFiltering(e.target.checked)}
                />
                <span className="planning-grid-toggle-slider"></span>
              </label>
            </div>
          )}
        </div>

        {/* Right Panel - Grid Preview */}
        {gridPreviewOpen && (
          <div className="planning-grid-right-panel">
            <div className="planning-grid-preview-container">
              <div className="planning-grid-preview-header">
                <div className="planning-grid-preview-title-section">
                  <h3 className="planning-grid-preview-title">
                    {selectedComponentTab === 'Measures' ? 'Grid preview' : activeDimensionContent.previewTitle}
                  </h3>
                </div>
                <button
                  className="planning-grid-close-button"
                  onClick={() => setGridPreviewOpen(false)}
                >
                  <img src={imgCloseIcon} alt="Close" />
                </button>
              </div>

              <p className="planning-grid-preview-description">
                {selectedComponentTab === 'Measures'
                  ? 'Preview for measures configured as rows below the hierarchy.'
                  : activeDimensionContent.previewDescription}
              </p>

              <div className="planning-grid-preview-image">
                {selectedComponentTab === 'Measures' ? (
                  <img
                    src={imgMeasuresGridPreview}
                    alt="Measures grid preview"
                    className="planning-grid-preview-screenshot"
                  />
                ) : selectedComponentTab === 'Dimensions' && (activeDimension === 'Time' || activeDimension === 'Account' || activeDimension === 'Product') ? (
                  <img
                    src={
                      activeDimension === 'Time'
                        ? imgTimeGridPreview
                        : activeDimension === 'Account'
                          ? imgAccountGridPreview
                          : imgProductGridPreview
                    }
                    alt={`${activeDimension}-based grid preview`}
                    className="planning-grid-preview-screenshot"
                  />
                ) : (
                  <div className="planning-grid-preview-placeholder">
                    <span>Grid Preview</span>
                    <p>Preview will be generated based on your configuration</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Popover for additional info */}
      <div className="planning-grid-popover" style={{ display: 'none' }}>
        <h4 className="planning-grid-popover-title">Account Hierarchy</h4>
        <p className="planning-grid-popover-content">
          This hierarchy represents your organizational account structure from enterprise level down to individual accounts
        </p>
      </div>

      {isAddMeasuresModalOpen && (
        <div className="modal-overlay" onClick={closeAddMeasuresModal}>
          <div className="modal-container planning-grid-add-measures-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <h2 className="modal-title">Add Measures</h2>
              </div>
              <button className="modal-close-button" onClick={closeAddMeasuresModal}>
                <img src={imgCloseIcon} alt="Close" />
              </button>
            </div>

            <div className="modal-body">
              <div className="planning-grid-add-measures-body">
                <div className="planning-grid-add-measures-left">
                  <div className="planning-grid-step-header">
                    <div className="planning-grid-step-header-text">
                      <h4>Manage Subsets</h4>
                      <p>Select an existing subset or create a new one.</p>
                    </div>
                  </div>

                  <div className="planning-grid-subset-inputs">
                    <label>Add measure subset</label>
                    <div className="planning-grid-subset-input-row" style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Search or create subset..."
                        value={subsetNameInput}
                        onChange={(e) => {
                          setSubsetNameInput(e.target.value);
                          setShowSubsetDropdown(e.target.value.length > 0);
                        }}
                        onFocus={() => subsetNameInput && setShowSubsetDropdown(true)}
                        onBlur={() => setTimeout(() => setShowSubsetDropdown(false), 200)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && canCreateNew) {
                            handleCreateSubset();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleCreateSubset}
                        disabled={!canCreateNew}
                        style={{
                          opacity: canCreateNew ? 1 : 0.5,
                          cursor: canCreateNew ? 'pointer' : 'not-allowed',
                        }}
                      >
                        +
                      </button>

                      {/* Dropdown with available subsets */}
                      {showSubsetDropdown && filteredAvailableSubsets.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: 'white',
                          border: '1px solid #d8dde6',
                          borderRadius: '4px',
                          marginTop: '4px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          zIndex: 1000,
                        }}>
                          {filteredAvailableSubsets.map((subset) => (
                            <div
                              key={subset.id}
                              onMouseDown={() => handleSelectExistingSubset(subset)}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f3f3f3',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f3f3')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                            >
                              <div style={{ fontWeight: '500', fontSize: '14px' }}>{subset.name}</div>
                              {subset.description && (
                                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                                  {subset.description}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="planning-grid-subset-list">
                    {measureSubsets.map((subset) => (
                      <div
                        key={subset.id}
                        className={`planning-grid-subset-item ${selectedSubsetId === subset.id ? 'active' : ''}`}
                      >
                        <button
                          type="button"
                          className="planning-grid-subset-main"
                          onClick={() => handleSelectSubset(subset.id)}
                        >
                          {editingSubsetId === subset.id ? (
                            <input
                              className="planning-grid-subset-edit-input"
                              type="text"
                              value={editingSubsetName}
                              onChange={(e) => setEditingSubsetName(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={handleCommitSubsetRename}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCommitSubsetRename();
                                if (e.key === 'Escape') setEditingSubsetId(null);
                              }}
                              autoFocus
                            />
                          ) : (
                            <strong>{subset.name}</strong>
                          )}
                          <span>{(selectedMeasuresBySubset[subset.id] || []).length} measures selected</span>
                        </button>
                        <div className="planning-grid-subset-inline-actions">
                          <button
                            type="button"
                            className="planning-grid-subset-icon-button"
                            aria-label={`Edit ${subset.name}`}
                            onClick={() => handleStartSubsetRename(subset.id, subset.name)}
                          >
                            <img src={imgEditIconSmall} alt="" />
                          </button>
                          {subset.id !== 'default-subset' && (
                            <button
                              type="button"
                              className="planning-grid-subset-icon-button"
                              aria-label={`Delete ${subset.name}`}
                              onClick={() => handleDeleteSubset(subset.id)}
                            >
                              <img src={imgDeleteIconSmall} alt="" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="planning-grid-add-measures-right">
                  {!showCreateMeasureTypeView ? (
                    <>
                      <div className="planning-grid-step-header">
                        <div>
                          <h4>Select Measures</h4>
                          <p>Selections are saved to the selected subset only.</p>
                        </div>
                      </div>

                      <div className="planning-grid-measure-toolbar">
                        <div className="planning-grid-measure-search">
                          <img src={imgSearchSmall} alt="" />
                          <input
                            type="text"
                            placeholder="Search by name, description..."
                            value={measureSearchTerm}
                            onChange={(e) => setMeasureSearchTerm(e.target.value)}
                          />
                        </div>
                        <label className="planning-grid-measure-filter-wrap">
                          <select
                            className="planning-grid-measure-filter"
                            value={measureTypeFilter}
                            onChange={(e) => setMeasureTypeFilter(e.target.value)}
                          >
                            {measureTypeOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          <img src={imgDropdownSmall} alt="" />
                        </label>
                        <label className="planning-grid-measure-filter-wrap">
                          <select
                            className="planning-grid-measure-filter"
                            value={measureAggregationFilter}
                            onChange={(e) => setMeasureAggregationFilter(e.target.value)}
                          >
                            {measureAggregationOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          <img src={imgDropdownSmall} alt="" />
                        </label>
                        <label className="planning-grid-measure-filter-wrap">
                          <select
                            className="planning-grid-measure-filter"
                            value={measureDisaggregationFilter}
                            onChange={(e) => setMeasureDisaggregationFilter(e.target.value)}
                          >
                            {measureDisaggregationOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          <img src={imgDropdownSmall} alt="" />
                        </label>
                        <label className="planning-grid-measure-filter-wrap">
                          <select className="planning-grid-measure-filter">
                            {measureCategoryOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          <img src={imgDropdownSmall} alt="" />
                        </label>
                        <button type="button" className="planning-grid-create-new-button" onClick={handleOpenCreateMeasureTypeView}>
                          + Create Measure
                        </button>
                      </div>

                      <div className="planning-grid-table-controls">
                        <label className="planning-grid-show-selected">
                          <input
                            type="checkbox"
                            checked={showSelectedOnly}
                            onChange={(e) => setShowSelectedOnly(e.target.checked)}
                          />
                          <span>Show selected only ({selectedMeasureIdsForSubset.length})</span>
                        </label>
                      </div>

                      <div className="planning-grid-measures-table-wrap" key={measureTableKey}>
                        <table className="planning-grid-measures-table">
                          <thead>
                            <tr>
                              <th>
                                <input
                                  type="checkbox"
                                  checked={areAllFilteredMeasuresSelected}
                                  onChange={toggleAllFilteredMeasureSelections}
                                  disabled={!hasFilteredMeasures}
                                  aria-label="Select all filtered measures"
                                />
                              </th>
                              <th>MEASURE NAME</th>
                              <th>DESCRIPTION</th>
                              <th>MEASURE TYPE</th>
                              <th>SOURCE DMO</th>
                              <th>MEASURE CODE</th>
                              <th>AGGREGATION RULE</th>
                              <th>DISAGGREGATION RULE</th>
                              <th>CATEGORY</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {filteredMeasures.map((measure) => (
                              <tr key={measure.id}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={selectedMeasureIdsForSubset.includes(measure.id)}
                                    onChange={() => toggleMeasureSelection(measure.id)}
                                  />
                                </td>
                                <td><button type="button" className="planning-grid-link-button">{measure.name}</button></td>
                                <td>{measure.description}</td>
                                <td>{measure.type}</td>
                                <td>{measure.sourceDmo}</td>
                                <td>{measure.code}</td>
                                <td>{measure.aggregation}</td>
                                <td>{measure.disaggregation}</td>
                                <td>
                                  <span className={getCategoryClassName(measure.category)}>{measure.category}</span>
                                </td>
                                <td>
                                  <button type="button" className="table-row-dropdown" aria-label={`Actions for ${measure.name}`}>
                                    <img src={imgDropdownSmall} alt="" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="planning-grid-measure-type-selector">
                      <div className="planning-grid-step-header planning-grid-create-measure-step-header">
                        <div className="planning-grid-step-header-text planning-grid-create-measure-step-title">
                          <h4>Create Measure</h4>
                          <p>Select a type first, then complete the form.</p>
                        </div>
                        <div className="planning-grid-create-header-actions">
                          <button
                            type="button"
                            className="edit-panel-text-button edit-panel-cancel-button"
                            onClick={() => setShowCreateMeasureTypeView(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="edit-panel-text-button edit-panel-save-button"
                            onClick={handleCreateMeasure}
                            disabled={!canCreateMeasure}
                            style={{ opacity: canCreateMeasure ? 1 : 0.5, cursor: canCreateMeasure ? 'pointer' : 'not-allowed' }}
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      <div className="edit-form-field planning-grid-create-subset-field">
                        <label className="edit-form-label" htmlFor="create-measure-subset-select">
                          Created in subset
                        </label>
                        <div className="planning-grid-create-subset-multi-select">
                          <button
                            id="create-measure-subset-select"
                            type="button"
                            className="planning-grid-create-subset-multi-trigger"
                            onClick={() => setShowCreateSubsetDropdown((prev) => !prev)}
                            onBlur={() => setTimeout(() => setShowCreateSubsetDropdown(false), 150)}
                          >
                            <span>
                              {selectedSubsetsForNewMeasure
                                .map((subsetId) => measureSubsets.find((subset) => subset.id === subsetId)?.name)
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                            <img src={imgDropdownSmall} alt="" />
                          </button>
                          {showCreateSubsetDropdown && (
                            <div className="planning-grid-create-subset-multi-menu">
                              {measureSubsets.map((subset) => (
                                <label key={subset.id} className="planning-grid-create-subset-multi-option">
                                  <input
                                    type="checkbox"
                                    checked={selectedSubsetsForNewMeasure.includes(subset.id)}
                                    onChange={() => toggleCreateSubsetSelection(subset.id)}
                                  />
                                  <span>{subset.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="edit-form-field planning-grid-create-type-field">
                        <label className="edit-form-label">Select type of measure you want to create</label>
                      </div>

                      {shouldUseMeasureTypeCombobox ? (
                        <div className="planning-grid-measure-type-combobox-wrap">
                          <label className="planning-grid-measure-type-combobox-label" htmlFor="measure-type-combobox-input">
                            Measure Type
                          </label>
                          <div className="planning-grid-measure-type-combobox">
                            <input
                              id="measure-type-combobox-input"
                              type="text"
                              value={measureTypeSearchTerm}
                              placeholder="Search measure type..."
                              onFocus={() => setShowMeasureTypeOptions(true)}
                              onBlur={() => setTimeout(() => setShowMeasureTypeOptions(false), 150)}
                              onChange={(e) => {
                                setMeasureTypeSearchTerm(e.target.value);
                                setShowMeasureTypeOptions(true);
                              }}
                            />
                            <img src={imgDropdownSmall} alt="" />
                          </div>
                          {showMeasureTypeOptions && (
                            <div className="planning-grid-measure-type-options">
                              {filteredMeasureTypeOptions.length === 0 ? (
                                <div className="planning-grid-measure-type-option-empty">No measure types found</div>
                              ) : (
                                filteredMeasureTypeOptions.map((typeOption) => (
                                  <button
                                    key={typeOption.id}
                                    type="button"
                                    className={`planning-grid-measure-type-option ${selectedCreateMeasureType === typeOption.id ? 'active' : ''}`}
                                    onClick={() => {
                                      setSelectedCreateMeasureType(typeOption.id);
                                      setMeasureTypeSearchTerm(typeOption.title);
                                      setShowMeasureTypeOptions(false);
                                    }}
                                  >
                                    <span>{typeOption.icon}</span>
                                    <span>{typeOption.title}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="planning-grid-measure-type-cards">
                          {availableMeasureTypes.map((typeOption) => (
                            <button
                              key={typeOption.id}
                              type="button"
                              className={`planning-grid-measure-type-card ${selectedCreateMeasureType === typeOption.id ? 'active' : ''}`}
                              onClick={() => setSelectedCreateMeasureType(typeOption.id)}
                            >
                              <span className="planning-grid-measure-type-icon">{typeOption.icon}</span>
                              <div className="planning-grid-measure-type-content">
                                <div className="planning-grid-measure-type-title">{typeOption.title}</div>
                                <div className="planning-grid-measure-type-description">
                                  This is a new potential customer not a part of the system yet
                                </div>
                              </div>
                              {selectedCreateMeasureType === typeOption.id && (
                                <span className="planning-grid-measure-type-check">✓</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {selectedCreateMeasureType ? (
                        <div className="planning-grid-create-measure-form">
                          <div className="measure-section">
                            <h4 className="measure-section-title">Information</h4>

                            <div className="edit-form-field">
                              <label className="edit-form-label">* Measure Name</label>
                              <input
                                type="text"
                                className="edit-form-input"
                                placeholder="Enter measure name..."
                                value={newMeasureFormValues.measureName}
                                onChange={(e) => handleNewMeasureFormChange('measureName', e.target.value)}
                              />
                            </div>

                            <div className="edit-form-field">
                              <label className="edit-form-label">* Measure Type</label>
                              <select
                                className="edit-form-select"
                                value={selectedCreateMeasureType}
                                onChange={(e) => {
                                  setSelectedCreateMeasureType(e.target.value);
                                  setMeasureTypeSearchTerm(e.target.value);
                                }}
                              >
                                {availableMeasureTypes.map((typeOption) => (
                                  <option key={typeOption.id} value={typeOption.id}>
                                    {typeOption.title}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="edit-form-field">
                              <label className="edit-form-label">* Description</label>
                              <textarea
                                className="edit-form-textarea"
                                placeholder="Enter description..."
                                rows={3}
                                value={newMeasureFormValues.description}
                                onChange={(e) => handleNewMeasureFormChange('description', e.target.value)}
                              />
                            </div>

                            <div className="edit-form-field">
                              <label className="edit-form-label">* Value Type</label>
                              <select
                                className="edit-form-select"
                                value={newMeasureFormValues.valueType}
                                onChange={(e) => handleNewMeasureFormChange('valueType', e.target.value)}
                              >
                                <option value="">Select value type...</option>
                                <option value="Volume">Volume</option>
                                <option value="Currency">Currency</option>
                                <option value="Percent">Percent</option>
                                <option value="Score">Score</option>
                              </select>
                            </div>

                            <div className="edit-form-field">
                              <label className="edit-form-label">* Rounding Precision</label>
                              <select
                                className="edit-form-select"
                                value={newMeasureFormValues.roundingPrecision}
                                onChange={(e) => handleNewMeasureFormChange('roundingPrecision', e.target.value)}
                              >
                                <option value="2">2 Decimal</option>
                                <option value="0">0 Decimal</option>
                                <option value="1">1 Decimal</option>
                                <option value="3">3 Decimal</option>
                                <option value="4">4 Decimal</option>
                              </select>
                            </div>
                          </div>

                          <div className="measure-section">
                            <h4 className="measure-section-title">Aggregation / Disaggregation Settings</h4>

                            <div className="edit-form-field">
                              <label className="edit-form-label">* Aggregation Rule</label>
                              <select
                                className="edit-form-select"
                                value={newMeasureFormValues.aggregationRule}
                                onChange={(e) => handleNewMeasureFormChange('aggregationRule', e.target.value)}
                              >
                                <option value="Sum">Sum</option>
                                <option value="Average">Average</option>
                                <option value="Count">Count</option>
                                <option value="Min">Min</option>
                                <option value="Max">Max</option>
                              </select>
                            </div>
                          </div>

                          <div className="measure-section">
                            <h4 className="measure-section-title">Settings</h4>

                            {selectedCreateMeasureType === 'Calculated' && (
                              <div className="edit-form-field">
                                <label className="edit-form-label">* Calculated Expression</label>
                                <div className="formula-builder">
                                  <div className="formula-inputs">
                                    <div className="source-search-wrapper">
                                      <input type="text" className="edit-form-input formula-input" placeholder="Search measures" />
                                    </div>
                                    <div className="source-search-wrapper">
                                      <input type="text" className="edit-form-input formula-input" placeholder="Select function" />
                                    </div>
                                    <div className="source-search-wrapper">
                                      <input type="text" className="edit-form-input formula-input" placeholder="Select operator" />
                                    </div>
                                  </div>
                                  <textarea
                                    className="edit-form-textarea formula-textarea"
                                    placeholder="Enter formula..."
                                    rows={4}
                                    value={newMeasureFormValues.calculatedExpression}
                                    onChange={(e) => handleNewMeasureFormChange('calculatedExpression', e.target.value)}
                                  />
                                  <button type="button" className="check-syntax-button">Check Syntax</button>
                                </div>
                              </div>
                            )}

                            <div className="edit-form-field">
                              <label className="edit-form-label">* Measure Code</label>
                              <input
                                type="text"
                                className="edit-form-input"
                                placeholder="Enter measure code..."
                                value={newMeasureFormValues.measureCode}
                                onChange={(e) => handleNewMeasureFormChange('measureCode', e.target.value)}
                              />
                            </div>

                            {selectedCreateMeasureType === 'Editable' && (
                              <div className="edit-form-field">
                                <label className="writeback-checkbox-label">
                                  <input
                                    type="checkbox"
                                    className="writeback-checkbox"
                                    checked={newMeasureFormValues.writebackEnabled}
                                    onChange={(e) => handleNewMeasureFormChange('writebackEnabled', e.target.checked)}
                                  />
                                  <span>Writeback enabled</span>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="planning-grid-create-measure-placeholder">
                          Select a measure type to continue.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer planning-grid-add-measures-footer">
              {showCreateMeasureTypeView ? (
                <>
                  <button
                    type="button"
                    className="planning-grid-footer-back-link"
                    onClick={() => setShowCreateMeasureTypeView(false)}
                  >
                    Back to measures
                  </button>
                  <div className="planning-grid-footer-right-actions">
                    <button
                      className="modal-cancel-button"
                      onClick={closeAddMeasuresModal}
                    >
                      Cancel
                    </button>
                    <button
                      className="modal-save-button"
                      onClick={closeAddMeasuresModal}
                      disabled
                      style={{ opacity: 0.5, cursor: 'not-allowed' }}
                    >
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    className="modal-cancel-button"
                    onClick={closeAddMeasuresModal}
                  >
                    Cancel
                  </button>
                  <button
                    className="modal-save-button"
                    onClick={closeAddMeasuresModal}
                  >
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save Configuration Modal */}
      {isSaveModalOpen && (
        <div className="modal-overlay" onClick={handleCancelSave}>
          <div className="modal-container" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Save Configuration</h2>
              <button className="modal-close-button" onClick={handleCancelSave}>
                <img src={imgCloseIcon} alt="Close" />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '24px', display: 'block' }}>
              <div className="edit-form-field">
                <label className="edit-form-label">
                  Configuration Name *
                </label>
                <input
                  type="text"
                  className="edit-form-input"
                  placeholder="Enter configuration name"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="edit-form-field" style={{ marginTop: '16px' }}>
                <label className="edit-form-label">
                  Description
                </label>
                <textarea
                  className="edit-form-textarea"
                  placeholder="Enter description (optional)"
                  value={configDescription}
                  onChange={(e) => setConfigDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-cancel-button" onClick={handleCancelSave}>
                Cancel
              </button>
              <button
                className="modal-save-button"
                onClick={handleConfirmSave}
                disabled={!configName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <AccessControlModal
        open={isAssignToModalOpen}
        onClose={() => setIsAssignToModalOpen(false)}
        title="Access control settings"
        primaryLabel="Save"
      />

    </div>
  );
}

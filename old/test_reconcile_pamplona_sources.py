from collections import defaultdict

import reconcile_pamplona_sources as mod


def _location(location_id: str) -> mod.LocationInfo:
    info = mod.parse_location(location_id)
    assert info is not None
    return info


def test_allocate_products_prefers_near_partial_bins_over_far_empty_bins():
    state = {
        "location_infos": {
            loc.location_id: loc
            for loc in [
                _location("LJ060001-R5-005-5A"),
                _location("LJ060001-R5-005-5B"),
                _location("LJ060001-R5-005-5C"),
                _location("LJ060001-R5-005-5D"),
                _location("LJ060001-R5-005-5E"),
                _location("LJ060001-R6-004-5A"),
                _location("LJ060001-R6-004-5E"),
                _location("LJ060001-R6-004-5F"),
            ]
        },
        "location_capacity": {
            "LJ060001-R5-005-5A": 2,
            "LJ060001-R5-005-5B": 2,
            "LJ060001-R5-005-5C": 2,
            "LJ060001-R5-005-5D": 2,
            "LJ060001-R5-005-5E": 2,
            "LJ060001-R6-004-5A": 2,
            "LJ060001-R6-004-5E": 2,
            "LJ060001-R6-004-5F": 2,
        },
    }
    state["by_equip_level"] = {
        ("LJ060001", 5, 5, 5): [
            "LJ060001-R5-005-5A",
            "LJ060001-R5-005-5B",
            "LJ060001-R5-005-5C",
            "LJ060001-R5-005-5D",
            "LJ060001-R5-005-5E",
        ],
        ("LJ060001", 6, 4, 5): [
            "LJ060001-R6-004-5A",
            "LJ060001-R6-004-5E",
            "LJ060001-R6-004-5F",
        ],
    }
    state["by_equip"] = {
        ("LJ060001", 5, 5): [
            "LJ060001-R5-005-5A",
            "LJ060001-R5-005-5B",
            "LJ060001-R5-005-5C",
            "LJ060001-R5-005-5D",
            "LJ060001-R5-005-5E",
        ],
        ("LJ060001", 6, 4): [
            "LJ060001-R6-004-5A",
            "LJ060001-R6-004-5E",
            "LJ060001-R6-004-5F",
        ],
    }
    state["location_types"] = {loc: "geladeira" for loc in state["location_infos"]}

    desired = {
        "ANCHOR_B": mod.DesiredProduct("ANCHOR_B", "N2", "LJ060001-R5-005-5B", 1, []),
        "ANCHOR_C1": mod.DesiredProduct("ANCHOR_C1", "N2", "LJ060001-R5-005-5C", 1, []),
        "ANCHOR_C2": mod.DesiredProduct("ANCHOR_C2", "N2", "LJ060001-R5-005-5C", 1, []),
        "ANCHOR_D": mod.DesiredProduct("ANCHOR_D", "N2", "LJ060001-R5-005-5D", 1, []),
        "ANCHOR_E": mod.DesiredProduct("ANCHOR_E", "N2", "LJ060001-R5-005-5E", 1, []),
        "SHOP001": mod.DesiredProduct("SHOP001", "N2", "LJ060001-R5-005-5A", 4, []),
    }

    allocation = mod.allocate_products(state, desired)

    assert desired["SHOP001"].assigned_locations == [
        "LJ060001-R5-005-5A",
        "LJ060001-R5-005-5B",
        "LJ060001-R5-005-5D",
    ]
    assert "LJ060001-R6-004-5A" not in desired["SHOP001"].assigned_locations
    assert allocation["shortfalls"] == {"SHOP001": 1}


def test_verify_model_flags_proximity_spill():
    state = {
        "location_infos": {
            loc.location_id: loc
            for loc in [
                _location("LJ060001-R5-005-5A"),
                _location("LJ060001-R5-005-5B"),
                _location("LJ060001-R6-004-5A"),
            ]
        },
        "location_capacity": {
            "LJ060001-R5-005-5A": 2,
            "LJ060001-R5-005-5B": 2,
            "LJ060001-R6-004-5A": 2,
        },
        "by_equip": {
            ("LJ060001", 5, 5): ["LJ060001-R5-005-5A", "LJ060001-R5-005-5B"],
            ("LJ060001", 6, 4): ["LJ060001-R6-004-5A"],
        },
        "base_by_code": {
            "SHOP001": {"escaninhos_necessarios": 2},
            "ANCHOR_B": {"escaninhos_necessarios": 1},
        },
    }
    desired = {
        "SHOP001": mod.DesiredProduct("SHOP001", "N2", "LJ060001-R5-005-5A", 2, ["LJ060001-R5-005-5A", "LJ060001-R6-004-5A"]),
        "ANCHOR_B": mod.DesiredProduct("ANCHOR_B", "N2", "LJ060001-R5-005-5B", 1, ["LJ060001-R5-005-5B"]),
    }
    allocation = {
        "assignments_by_location": defaultdict(list, {
            "LJ060001-R5-005-5A": ["SHOP001"],
            "LJ060001-R5-005-5B": ["ANCHOR_B"],
            "LJ060001-R6-004-5A": ["SHOP001"],
        }),
        "anchor_over_capacity": [],
        "missing_anchor_locations": [],
        "shortfalls": {},
    }
    verification = mod.verify_model(state, desired, allocation, {"by_code": {"SHOP001": ["LJ060001-R5-005-5A"]}, "by_location": {}, "aaa_count": 0}, {"by_code": {}, "by_location": {}, "invalid": []})
    assert verification["proximity_issues"]


def test_allocate_products_does_not_cross_equipment_type():
    state = {
        "location_infos": {
            loc.location_id: loc
            for loc in [
                _location("LJ060001-R2-015-3A"),
                _location("LJ060001-R2-015-3B"),
                _location("LJ060001-R2-017-3A"),
            ]
        },
        "location_capacity": {
            "LJ060001-R2-015-3A": 2,
            "LJ060001-R2-015-3B": 2,
            "LJ060001-R2-017-3A": 2,
        },
        "location_types": {
            "LJ060001-R2-015-3A": "prateleira",
            "LJ060001-R2-015-3B": "prateleira",
            "LJ060001-R2-017-3A": "freezer",
        },
        "by_equip_level": {
            ("LJ060001", 2, 15, 3): ["LJ060001-R2-015-3A", "LJ060001-R2-015-3B"],
            ("LJ060001", 2, 17, 3): ["LJ060001-R2-017-3A"],
        },
        "by_equip": {
            ("LJ060001", 2, 15): ["LJ060001-R2-015-3A", "LJ060001-R2-015-3B"],
            ("LJ060001", 2, 17): ["LJ060001-R2-017-3A"],
        },
    }
    desired = {
        "SHOP570": mod.DesiredProduct("SHOP570", "N2", "LJ060001-R2-015-3A", 2, []),
    }
    allocation = mod.allocate_products(state, desired)
    assert desired["SHOP570"].assigned_locations == [
        "LJ060001-R2-015-3A",
        "LJ060001-R2-015-3B",
    ]
    assert "LJ060001-R2-017-3A" not in desired["SHOP570"].assigned_locations
    assert not allocation["shortfalls"]


def test_allocate_products_does_not_cross_rua_when_same_rua_exhausted():
    state = {
        "location_infos": {
            loc.location_id: loc
            for loc in [
                _location("LJ060001-R2-015-3A"),
                _location("LJ060001-R3-017-3A"),
            ]
        },
        "location_capacity": {
            "LJ060001-R2-015-3A": 1,
            "LJ060001-R3-017-3A": 2,
        },
        "location_types": {
            "LJ060001-R2-015-3A": "prateleira",
            "LJ060001-R3-017-3A": "prateleira",
        },
        "by_equip_level": {
            ("LJ060001", 2, 15, 3): ["LJ060001-R2-015-3A"],
            ("LJ060001", 3, 17, 3): ["LJ060001-R3-017-3A"],
        },
        "by_equip": {
            ("LJ060001", 2, 15): ["LJ060001-R2-015-3A"],
            ("LJ060001", 3, 17): ["LJ060001-R3-017-3A"],
        },
    }
    desired = {
        "SKU2": mod.DesiredProduct("SKU2", "N2", "LJ060001-R2-015-3A", 2, []),
    }
    allocation = mod.allocate_products(state, desired)
    assert desired["SKU2"].assigned_locations == ["LJ060001-R2-015-3A"]
    assert allocation["shortfalls"] == {"SKU2": 1}


def test_allocate_products_does_not_leave_anchor_level_even_if_same_equipment_has_space():
    state = {
        "location_infos": {
            loc.location_id: loc
            for loc in [
                _location("LJ060001-R2-001-5A"),
                _location("LJ060001-R2-001-5B"),
                _location("LJ060001-R2-001-5C"),
                _location("LJ060001-R2-001-4A"),
                _location("LJ060001-R2-001-4B"),
            ]
        },
        "location_capacity": {
            "LJ060001-R2-001-5A": 2,
            "LJ060001-R2-001-5B": 2,
            "LJ060001-R2-001-5C": 2,
            "LJ060001-R2-001-4A": 2,
            "LJ060001-R2-001-4B": 2,
        },
        "location_types": {
            "LJ060001-R2-001-5A": "geladeira",
            "LJ060001-R2-001-5B": "geladeira",
            "LJ060001-R2-001-5C": "geladeira",
            "LJ060001-R2-001-4A": "geladeira",
            "LJ060001-R2-001-4B": "geladeira",
        },
        "by_equip_level": {
            ("LJ060001", 2, 1, 5): ["LJ060001-R2-001-5A", "LJ060001-R2-001-5B", "LJ060001-R2-001-5C"],
            ("LJ060001", 2, 1, 4): ["LJ060001-R2-001-4A", "LJ060001-R2-001-4B"],
        },
        "by_equip": {
            ("LJ060001", 2, 1): [
                "LJ060001-R2-001-4A",
                "LJ060001-R2-001-4B",
                "LJ060001-R2-001-5A",
                "LJ060001-R2-001-5B",
                "LJ060001-R2-001-5C",
            ]
        },
    }
    desired = {
        "EXISTING_B1": mod.DesiredProduct("EXISTING_B1", "N2", "LJ060001-R2-001-5B", 1, []),
        "EXISTING_B2": mod.DesiredProduct("EXISTING_B2", "N2", "LJ060001-R2-001-5B", 1, []),
        "EXISTING_C1": mod.DesiredProduct("EXISTING_C1", "N2", "LJ060001-R2-001-5C", 1, []),
        "EXISTING_C2": mod.DesiredProduct("EXISTING_C2", "N2", "LJ060001-R2-001-5C", 1, []),
        "SHOP974": mod.DesiredProduct("SHOP974", "N2", "LJ060001-R2-001-5A", 3, []),
    }

    allocation = mod.allocate_products(state, desired)

    assert desired["SHOP974"].assigned_locations == ["LJ060001-R2-001-5A"]
    assert allocation["shortfalls"] == {"SHOP974": 2}
    assert "LJ060001-R2-001-4A" not in desired["SHOP974"].assigned_locations


def test_allocate_products_respects_volume_capacity_for_inferred_bins():
    state = {
        "location_infos": {
            loc.location_id: loc
            for loc in [
                _location("LJ060001-R2-015-3A"),
                _location("LJ060001-R2-015-3B"),
            ]
        },
        "location_capacity": {
            "LJ060001-R2-015-3A": 2,
            "LJ060001-R2-015-3B": 2,
        },
        "location_capacity_l": {
            "LJ060001-R2-015-3A": 16.384,
            "LJ060001-R2-015-3B": 16.384,
        },
        "location_types": {
            "LJ060001-R2-015-3A": "freezer",
            "LJ060001-R2-015-3B": "freezer",
        },
        "by_equip_level": {
            ("LJ060001", 2, 15, 3): ["LJ060001-R2-015-3A", "LJ060001-R2-015-3B"],
        },
        "by_equip": {
            ("LJ060001", 2, 15): ["LJ060001-R2-015-3A", "LJ060001-R2-015-3B"],
        },
        "base_by_code": {
            "ICE": {"vol_L_unitario": "20,625"},
        },
        "supplement_by_code": {},
    }
    desired = {
        "ICE": mod.DesiredProduct("ICE", "N2", "LJ060001-R2-015-3A", 2, []),
    }
    allocation = mod.allocate_products(state, desired)
    assert desired["ICE"].assigned_locations == ["LJ060001-R2-015-3A"]
    assert allocation["shortfalls"] == {"ICE": 1}




def test_build_authoritative_products_prefers_n3_and_preserves_n2_when_absent():
    state = {
        "base_by_code": {
            "SKU_N3": {"escaninhos_necessarios": 1},
            "SKU_N2": {"escaninhos_necessarios": 2},
        }
    }
    n2_data = {
        "by_code": {
            "SKU_N3": ["LJ060001-R2-001-1A"],
            "SKU_N2": ["LJ060001-R3-009-1D"],
        },
        "by_location": {},
        "aaa_count": 0,
    }
    n3_data = {
        "by_code": {
            "SKU_N3": ["LJ060001-R5-005-5A"],
        },
        "by_location": {},
        "invalid": [],
    }

    desired = mod.build_authoritative_products(state, n2_data, n3_data)

    assert desired["SKU_N3"].source == "N3"
    assert desired["SKU_N3"].authoritative_locations == ["LJ060001-R5-005-5A"]
    assert desired["SKU_N2"].source == "N2"
    assert desired["SKU_N2"].authoritative_locations == ["LJ060001-R3-009-1D"]


def test_verify_model_flags_equipment_type_divergence_from_actual_sheet():
    state = {
        "location_infos": {
            loc.location_id: loc
            for loc in [
                _location("LJ060001-R2-015-3A"),
                _location("LJ060001-R2-017-3A"),
            ]
        },
        "location_capacity": {
            "LJ060001-R2-015-3A": 2,
            "LJ060001-R2-017-3A": 2,
        },
        "location_types": {
            "LJ060001-R2-015-3A": "prateleira",
            "LJ060001-R2-017-3A": "freezer",
        },
        "by_equip": {
            ("LJ060001", 2, 15): ["LJ060001-R2-015-3A"],
            ("LJ060001", 2, 17): ["LJ060001-R2-017-3A"],
        },
        "base_by_code": {
            "SHOP570": {"escaninhos_necessarios": 2},
        },
    }
    desired = {
        "SHOP570": mod.DesiredProduct("SHOP570", "N2", "LJ060001-R2-015-3A", 2, []),
    }
    allocation = {
        "assignments_by_location": defaultdict(list, {
            "LJ060001-R2-015-3A": ["SHOP570"],
            "LJ060001-R2-017-3A": ["SHOP570"],
        }),
        "anchor_over_capacity": [],
        "missing_anchor_locations": [],
        "shortfalls": {},
    }
    verification = mod.verify_model(state, desired, allocation, {"by_code": {"SHOP570": ["LJ060001-R2-015-3A"]}, "by_location": {}, "aaa_count": 0}, {"by_code": {}, "by_location": {}, "invalid": []})
    assert verification["type_issues"]


def test_verify_model_flags_cross_rua_spill():
    state = {
        "location_infos": {
            loc.location_id: loc
            for loc in [
                _location("LJ060001-R2-015-3A"),
                _location("LJ060001-R3-017-3A"),
            ]
        },
        "location_capacity": {
            "LJ060001-R2-015-3A": 2,
            "LJ060001-R3-017-3A": 2,
        },
        "location_types": {
            "LJ060001-R2-015-3A": "prateleira",
            "LJ060001-R3-017-3A": "prateleira",
        },
        "by_equip": {
            ("LJ060001", 2, 15): ["LJ060001-R2-015-3A"],
            ("LJ060001", 3, 17): ["LJ060001-R3-017-3A"],
        },
        "base_by_code": {
            "SKU2": {"escaninhos_necessarios": 2},
        },
    }
    desired = {
        "SKU2": mod.DesiredProduct("SKU2", "N2", "LJ060001-R2-015-3A", 2, ["LJ060001-R2-015-3A", "LJ060001-R3-017-3A"]),
    }
    allocation = {
        "assignments_by_location": defaultdict(list, {
            "LJ060001-R2-015-3A": ["SKU2"],
            "LJ060001-R3-017-3A": ["SKU2"],
        }),
        "anchor_over_capacity": [],
        "missing_anchor_locations": [],
        "shortfalls": {},
    }
    verification = mod.verify_model(state, desired, allocation, {"by_code": {"SKU2": ["LJ060001-R2-015-3A"]}, "by_location": {}, "aaa_count": 0}, {"by_code": {}, "by_location": {}, "invalid": []})
    assert verification["cross_rua_issues"]

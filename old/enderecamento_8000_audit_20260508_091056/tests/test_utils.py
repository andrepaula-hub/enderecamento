from core.utils import parse_number


def test_parse_number_handles_ptbr_and_us_formats() -> None:
    assert parse_number("4.160,00") == 4160.0
    assert parse_number("2.722,50") == 2722.5
    assert parse_number("1,234.56") == 1234.56
    assert parse_number("R$ 1.234,00") == 1234.0
    assert parse_number("27,5") == 27.5


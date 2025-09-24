from django.db import migrations
from django.core.management import call_command
import os


def load_initial_safe_data(apps, schema_editor):
    fixture_file = '/app/migration/fixtures/safe_full_data.json'
    
    if not os.path.exists(fixture_file):
        return
    
    try:
        call_command('loaddata', fixture_file, verbosity=0)
    except Exception:
        pass


def reverse_initial_safe_data(apps, schema_editor):
    SafeContract = apps.get_model('history', 'SafeContract')
    SafeMasterCopy = apps.get_model('history', 'SafeMasterCopy')
    ProxyFactory = apps.get_model('history', 'ProxyFactory')
    Contract = apps.get_model('contracts', 'Contract')
    ContractAbi = apps.get_model('contracts', 'ContractAbi')
    Chain = apps.get_model('history', 'Chain')
    
    try:
        SafeContract.objects.all().delete()
        Contract.objects.all().delete()
        ContractAbi.objects.all().delete()
        SafeMasterCopy.objects.all().delete()
        ProxyFactory.objects.all().delete()
        Chain.objects.all().delete()
    except Exception:
        pass


class Migration(migrations.Migration):

    dependencies = [
        ('history', '0095_remove_internaltx_history_internaltx_value_idx_and_more'),
        ('sites', '0002_alter_domain_unique'),
        ('django_celery_beat', '0019_alter_periodictasks_options'),
        ('admin', '0003_logentry_add_action_flag_choices'),
        ('auth', '0012_alter_user_first_name_max_length'),
        ('contenttypes', '0002_remove_content_type_name'),
        ('sessions', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(
            code=load_initial_safe_data,
            reverse_code=reverse_initial_safe_data,
        ),
    ]
